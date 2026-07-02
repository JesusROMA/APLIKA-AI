-- ============================================================================
-- Aplika.ai — 0003 · Lógica de negocio (RPC + triggers)
-- Order-to-Cash, kardex atómico, folios. Funciones SECURITY DEFINER que validan
-- el tenant manualmente (porque bypassan RLS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Guard: aborta si la org objetivo no es la del usuario (ni super_admin)
-- ----------------------------------------------------------------------------
create or replace function app.assert_org(p_org uuid)
returns void language plpgsql stable security definer set search_path = public, app as $$
begin
  -- service_role = contexto de servidor de confianza (webhooks Stripe, jobs).
  if auth.role() = 'service_role' then return; end if;
  if not (app.is_super_admin() or p_org = app.current_org_id()) then
    raise exception 'forbidden: org mismatch' using errcode = '42501';
  end if;
end; $$;

-- ----------------------------------------------------------------------------
-- Folios incrementales por organización
-- ----------------------------------------------------------------------------
create or replace function app.next_folio(p_org uuid, p_entity text)
returns integer language plpgsql security definer set search_path = public, app as $$
declare v integer;
begin
  insert into org_counters (organization_id, entity, value)
  values (p_org, p_entity, 1)
  on conflict (organization_id, entity)
  do update set value = org_counters.value + 1
  returning value into v;
  return v;
end; $$;

-- Wrapper público: PostgREST (supabase.rpc) solo expone funciones de `public`.
create or replace function public.next_folio(p_org uuid, p_entity text)
returns integer language sql security definer set search_path = public, app as $$
  select app.next_folio(p_org, p_entity);
$$;
grant execute on function public.next_folio(uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Ajuste / movimiento de inventario (entrada, salida o ajuste) + kardex
-- p_qty con signo. Devuelve la fila de inventario resultante.
-- ----------------------------------------------------------------------------
create or replace function public.adjust_inventory(
  p_variant   uuid,
  p_warehouse uuid,
  p_qty       integer,
  p_type      movement_type default 'ajuste',
  p_reason    text default null,
  p_ref_type  text default 'adjustment',
  p_ref_id    uuid default null
) returns inventory
language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid;
  v_inv inventory;
  v_allow_back boolean;
begin
  select organization_id into v_org from product_variants where id = p_variant;
  if v_org is null then raise exception 'variant not found'; end if;
  perform app.assert_org(v_org);

  select allow_backorder into v_allow_back from organizations where id = v_org;

  insert into inventory (organization_id, product_variant_id, warehouse_id, stock)
  values (v_org, p_variant, p_warehouse, 0)
  on conflict (product_variant_id, warehouse_id) do nothing;

  select * into v_inv from inventory
   where product_variant_id = p_variant and warehouse_id = p_warehouse for update;

  if (v_inv.stock + p_qty) < 0 and not v_allow_back then
    raise exception 'insufficient stock for variant % (have %, need %)',
      p_variant, v_inv.stock, abs(p_qty) using errcode = 'P0001';
  end if;

  update inventory set stock = stock + p_qty, updated_at = now()
   where id = v_inv.id returning * into v_inv;

  insert into inventory_movements
    (organization_id, product_variant_id, warehouse_id, type, qty, reason, ref_type, ref_id, created_by)
  values
    (v_org, p_variant, p_warehouse, p_type, p_qty, p_reason, p_ref_type, p_ref_id, auth.uid());

  return v_inv;
end; $$;

-- ----------------------------------------------------------------------------
-- Aplica el decremento de stock de un pedido (idempotente vía stock_applied)
-- ----------------------------------------------------------------------------
create or replace function app.apply_order_stock(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_order  orders;
  v_wh     uuid;
  it       record;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order is null then raise exception 'order not found'; end if;
  if v_order.stock_applied then return; end if;

  v_wh := coalesce(
    v_order.warehouse_id,
    (select id from warehouses where organization_id = v_order.organization_id and is_default order by created_at limit 1),
    (select id from warehouses where organization_id = v_order.organization_id order by created_at limit 1)
  );

  for it in
    select product_variant_id, qty, name from order_items
     where order_id = p_order_id and product_variant_id is not null
  loop
    perform public.adjust_inventory(
      it.product_variant_id, v_wh, -it.qty, 'salida',
      'Pedido ' || v_order.folio, 'order', v_order.id
    );
  end loop;

  update orders set stock_applied = true where id = p_order_id;
end; $$;

-- ----------------------------------------------------------------------------
-- Transición de estado del pedido con validación de pipeline + efectos
-- ----------------------------------------------------------------------------
create or replace function public.transition_order(
  p_order_id uuid,
  p_new      order_status
) returns orders
language plpgsql security definer set search_path = public, app as $$
declare
  v_order  orders;
  v_idx    int;
  v_new    int;
  pipeline order_status[] := array['borrador','confirmado','pagado','surtido','facturado','enviado']::order_status[];
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order is null then raise exception 'order not found'; end if;
  perform app.assert_org(v_order.organization_id);

  if p_new = 'cancelada' then
    if v_order.status in ('facturado','enviado') then
      raise exception 'no se puede cancelar un pedido %', v_order.status;
    end if;
    update orders set status = 'cancelada', updated_at = now() where id = p_order_id returning * into v_order;
    return v_order;
  end if;

  if v_order.status = 'cancelada' then
    raise exception 'pedido cancelado: transición no permitida';
  end if;

  select array_position(pipeline, v_order.status) into v_idx;
  select array_position(pipeline, p_new) into v_new;
  if v_new is null then raise exception 'estado destino inválido'; end if;
  if v_new < v_idx then raise exception 'no se permite retroceder de % a %', v_order.status, p_new; end if;

  -- Aplica stock al alcanzar pagado/surtido por primera vez
  if p_new in ('pagado','surtido','facturado','enviado') then
    perform app.apply_order_stock(p_order_id);
  end if;

  update orders set status = p_new, updated_at = now() where id = p_order_id returning * into v_order;
  return v_order;
end; $$;

grant execute on function public.adjust_inventory(uuid,uuid,integer,movement_type,text,text,uuid) to authenticated, service_role;
grant execute on function public.transition_order(uuid, order_status) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Alta de profile al registrarse un usuario (Supabase Auth)
-- La organización se asigna después por el flujo de invitación/onboarding.
-- ----------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'tenant_user')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
