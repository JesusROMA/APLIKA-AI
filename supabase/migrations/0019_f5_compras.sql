-- ============================================================================
-- Aplika.ai — 0019 · FASE 5 Compras y Proveedores · Contrato F5 C1.1–C1.4
-- Cierra el ciclo de inventario con costo de entrada real: la RECEPCIÓN de una
-- orden de compra aplica ENTRADA a inventario con el `unit_cost` de la OC vía
-- public.adjust_inventory (F2) ⇒ sube el costo promedio ponderado del artículo.
-- Espejo "inbound" de Ventas. Módulo RBAC nuevo: `compras`.
--
-- Reutiliza los patrones de F0/F1/F2 (0010/0012/0014): app.* SECURITY DEFINER +
-- wrapper public.*, app.has_perm / app.org_has_module, app.assert_org,
-- app.log_audit, next_serie_folio, RLS por operación (DO-loop), grants base.
-- Requiere 0018_f5_enums.sql (enums ya committeados).
--
-- DESVIACIONES / NOTAS respecto a C1 (documentadas):
--  · next_serie_folio gana la rama 'purchase'→'OC' en su CASE de prefijo
--    (additivo; conserva quote/order/sales_note/invoice/count/transfer). El
--    wrapper public.next_serie_folio de 0012 sigue válido (delega en app.*).
--  · recibir_compra sólo aplica ENTRADA a partidas con product_variant_id NO
--    nulo (una partida de servicio/flete no mueve inventario). El recálculo de
--    estado sí considera TODAS las partidas (una OC con partida sin variante que
--    quede pendiente permanece 'recibida_parcial'; es coherente con el contrato).
--  · La SUBIDA de suppliers.balance al REGISTRAR la factura la hace el endpoint
--    (Tanda B), NO la BD ⇒ no se agrega trigger (evita doble conteo). Sólo el
--    pago BAJA el balance vía registrar_pago_compra.
--  · qty/qty_received son numeric(14,3) (coherente con quote/sales items); la
--    entrada a inventario se redondea a entero (inventory.stock INTEGER), igual
--    que cobrar_remision (round(qty)::int).
-- ============================================================================


-- ============================================================================
-- A · next_serie_folio v3 — misma lógica de 0012/0014 + prefijo 'purchase'→'OC'.
--     Sólo se extiende el CASE del prefijo (additivo). El wrapper public.* de
--     0012 sigue válido. Seed de la serie ('purchase','OC') para orgs existentes.
-- ============================================================================
create or replace function app.next_serie_folio(
  p_org      uuid,
  p_doc_type text,
  p_serie    text default null
) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  v_serie  text := coalesce(p_serie, 'A');
  v_prefix text;
  v_val    int;
  v_row    org_series;
begin
  v_prefix := case p_doc_type
    when 'quote'      then 'COT'
    when 'order'      then 'PED'
    when 'sales_note' then 'REM'
    when 'invoice'    then 'FAC'
    when 'count'      then 'CONT'   -- F2: conteos físicos
    when 'transfer'   then 'TRAS'   -- F2: traspasos entre almacenes
    when 'purchase'   then 'OC'     -- F5: órdenes de compra
    else upper(left(p_doc_type, 3)) end;

  select * into v_row from org_series
   where organization_id = p_org and doc_type = p_doc_type and serie = v_serie
   for update;

  if not found then
    insert into org_series (organization_id, doc_type, serie, prefix, next_value)
    values (p_org, p_doc_type, v_serie, v_prefix, 1)
    on conflict (organization_id, doc_type, serie) do nothing;
    select * into v_row from org_series
     where organization_id = p_org and doc_type = p_doc_type and serie = v_serie
     for update;
  end if;

  update org_series set next_value = next_value + 1
   where id = v_row.id
   returning next_value into v_val;

  return v_row.prefix || '-' || v_serie || '-' || lpad((v_val - 1)::text, 4, '0');
end; $$;

-- Seed de la serie F5 para las orgs existentes (patrón del seed de 0012/0014).
-- Las orgs futuras autocrean la serie vía next_serie_folio (prefijo correcto).
insert into org_series (organization_id, doc_type, serie, prefix, next_value)
select o.id, 'purchase', 'A', 'OC', 1
  from organizations o
on conflict (organization_id, doc_type, serie) do nothing;


-- ============================================================================
-- B · PROVEEDORES (suppliers) — maestro · C1.1
-- ============================================================================
create table if not exists suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  rfc             text,                               -- opcional; si no null, patrón CFDI
  contact_name    text,
  phone           text,
  email           text,
  address         text,
  payment_days    int  not null default 0,            -- días de crédito que nos dan
  balance         numeric(14,2) not null default 0,   -- CxP (lo que les debemos)
  active          boolean not null default true,
  custom          jsonb not null default '{}'::jsonb,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name),
  constraint suppliers_rfc_format
    check (rfc is null or rfc ~* '^([A-ZÑ&]{3,4})[0-9]{6}[A-Z0-9]{3}$')
);
create index if not exists idx_suppliers_org_active on suppliers(organization_id, active);
create index if not exists idx_suppliers_org_name on suppliers(organization_id, name);

drop trigger if exists trg_suppliers_touch on suppliers;
create trigger trg_suppliers_touch before update on suppliers
  for each row execute function app.touch_updated_at();


-- ============================================================================
-- C · ÓRDENES DE COMPRA (purchase_orders + purchase_order_items) — C1.2
-- ============================================================================
create table if not exists purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  folio           text not null,                      -- next_serie_folio(org,'purchase') → 'OC-A-0001'
  supplier_id     uuid not null references suppliers(id),
  warehouse_id    uuid references warehouses(id),     -- destino de la recepción
  status          purchase_order_status not null default 'borrador',
  expected_date   date,
  subtotal        numeric(14,2) not null default 0,
  tax             numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  notas           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, folio)
);
create index if not exists idx_po_org_status on purchase_orders(organization_id, status);
create index if not exists idx_po_org_created on purchase_orders(organization_id, created_at desc);
create index if not exists idx_po_supplier on purchase_orders(supplier_id);

create table if not exists purchase_order_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  purchase_order_id  uuid not null references purchase_orders(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  sku                text,
  name               text not null,
  qty                numeric(14,3) not null check (qty > 0),
  qty_received       numeric(14,3) not null default 0,
  unit_cost          numeric(14,4) not null,          -- costo pactado con el proveedor
  iva_rate           numeric(4,3)  not null default 0.160,
  line_total         numeric(14,2) not null
);
create index if not exists idx_poi_org on purchase_order_items(organization_id);
create index if not exists idx_poi_po on purchase_order_items(purchase_order_id);

drop trigger if exists trg_purchase_orders_touch on purchase_orders;
create trigger trg_purchase_orders_touch before update on purchase_orders
  for each row execute function app.touch_updated_at();

-- Recibe (parcial/total) una OC: por cada partida de p_lines aplica ENTRADA a
-- inventario con el unit_cost pactado ⇒ sube el costo promedio (F2). Suma a
-- qty_received con clamp a lo pendiente; recalcula el estado de la OC.
-- p_lines = [{"item_id":uuid,"qty":number}].
create or replace function app.recibir_compra(
  p_po    uuid,
  p_lines jsonb
) returns purchase_orders
language plpgsql security definer set search_path = public, app as $$
declare
  v_po    purchase_orders;
  v_wh    uuid;
  ln      jsonb;
  v_item  purchase_order_items;
  v_recibir numeric(14,3);
  v_total int;
  v_full  int;
  v_any   int;
  v_status purchase_order_status;
begin
  select * into v_po from purchase_orders where id = p_po for update;
  if v_po is null then raise exception 'orden de compra no encontrada'; end if;
  perform app.assert_org(v_po.organization_id);

  if not app.has_perm('compras','editar') then
    raise exception 'forbidden: falta permiso compras/editar' using errcode = '42501';
  end if;
  if v_po.status not in ('confirmada','recibida_parcial') then
    raise exception 'la OC % no admite recepción (estado %)', v_po.folio, v_po.status;
  end if;

  -- Almacén destino: el de la OC o el default de la org (o el primero).
  v_wh := coalesce(
    v_po.warehouse_id,
    (select id from warehouses where organization_id = v_po.organization_id and is_default order by created_at limit 1),
    (select id from warehouses where organization_id = v_po.organization_id order by created_at limit 1)
  );
  if v_wh is null then
    raise exception 'la org % no tiene almacén para recibir la OC %', v_po.organization_id, v_po.folio;
  end if;

  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    select * into v_item from purchase_order_items
     where id = (ln->>'item_id')::uuid and purchase_order_id = p_po;
    if v_item is null then
      raise exception 'partida % no pertenece a la OC %', (ln->>'item_id'), v_po.folio;
    end if;

    -- Cantidad a recibir: no exceder lo pendiente (qty - qty_received).
    v_recibir := least((ln->>'qty')::numeric, v_item.qty - v_item.qty_received);

    if v_recibir > 0 then
      -- Sólo mueve inventario si la partida tiene variante (una partida de
      -- servicio/flete no toca stock). El costo promedio sube con datos reales.
      if v_item.product_variant_id is not null then
        perform public.adjust_inventory(
          v_item.product_variant_id, v_wh, round(v_recibir)::int, 'entrada',
          'Compra ' || v_po.folio, 'purchase', v_po.id, v_item.unit_cost
        );
      end if;
      update purchase_order_items
         set qty_received = qty_received + v_recibir
       where id = v_item.id;
    end if;
  end loop;

  -- Recalcula el estado agregando sobre TODAS las partidas de la OC.
  select count(*),
         count(*) filter (where qty_received >= qty),
         count(*) filter (where qty_received > 0)
    into v_total, v_full, v_any
    from purchase_order_items where purchase_order_id = p_po;

  if v_total > 0 and v_full = v_total then
    v_status := 'recibida';
  elsif v_any > 0 then
    v_status := 'recibida_parcial';
  else
    v_status := v_po.status;   -- nada recibido ⇒ sin cambio
  end if;

  update purchase_orders set status = v_status, updated_at = now()
   where id = p_po returning * into v_po;

  perform app.log_audit('purchase_order', v_po.id::text, 'recibir',
    jsonb_build_object('lines', coalesce(p_lines,'[]'::jsonb), 'status', v_status),
    v_po.organization_id);

  return v_po;
end; $$;

create or replace function public.recibir_compra(p_po uuid, p_lines jsonb)
returns purchase_orders
language plpgsql security definer set search_path = public, app as $$
begin
  return app.recibir_compra(p_po, p_lines);
end; $$;
grant execute on function public.recibir_compra(uuid, jsonb) to authenticated, service_role;


-- ============================================================================
-- D · CUENTAS POR PAGAR (supplier_invoices + supplier_invoice_payments) — C1.3
-- ============================================================================
create table if not exists supplier_invoices (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  supplier_id       uuid not null references suppliers(id),
  purchase_order_id uuid references purchase_orders(id),
  folio             text not null,                    -- folio del PROVEEDOR (texto libre)
  uuid              text,                             -- folio fiscal que nos dieron (opcional)
  fecha             date not null default current_date,
  subtotal          numeric(14,2) not null default 0,
  tax               numeric(14,2) not null default 0,
  total             numeric(14,2) not null default 0,
  saldo             numeric(14,2),
  status            supplier_invoice_status not null default 'registrada',
  metodo_pago       text,
  forma_pago        text,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_sinv_org_status on supplier_invoices(organization_id, status);
create index if not exists idx_sinv_org_created on supplier_invoices(organization_id, created_at desc);
create index if not exists idx_sinv_supplier on supplier_invoices(supplier_id);

create table if not exists supplier_invoice_payments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  supplier_invoice_id uuid not null references supplier_invoices(id) on delete cascade,
  fecha               date not null default current_date,
  monto               numeric(14,2) not null check (monto > 0),
  forma_pago          text not null,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now()
);
create index if not exists idx_sinv_pay_org on supplier_invoice_payments(organization_id);
create index if not exists idx_sinv_pay_inv on supplier_invoice_payments(supplier_invoice_id);

drop trigger if exists trg_supplier_invoices_touch on supplier_invoices;
create trigger trg_supplier_invoices_touch before update on supplier_invoices
  for each row execute function app.touch_updated_at();

-- Registra un pago a una factura de proveedor: recalcula el saldo, ajusta el
-- estado y BAJA suppliers.balance (la SUBIDA al registrar la factura la hace el
-- endpoint, no la BD; NO se toca aquí para evitar doble conteo).
create or replace function app.registrar_pago_compra(
  p_invoice uuid,
  p_monto   numeric,
  p_forma   text
) returns supplier_invoices
language plpgsql security definer set search_path = public, app as $$
declare
  v_inv    supplier_invoices;
  v_pagado numeric(14,2);
  v_saldo  numeric(14,2);
  v_status supplier_invoice_status;
begin
  select * into v_inv from supplier_invoices where id = p_invoice for update;
  if v_inv is null then raise exception 'factura de proveedor no encontrada'; end if;
  perform app.assert_org(v_inv.organization_id);

  if not app.has_perm('compras','editar') then
    raise exception 'forbidden: falta permiso compras/editar' using errcode = '42501';
  end if;
  if v_inv.status not in ('registrada','pago_parcial') then
    raise exception 'la factura % no admite pagos (estado %)', v_inv.folio, v_inv.status;
  end if;

  insert into supplier_invoice_payments
    (organization_id, supplier_invoice_id, monto, forma_pago, created_by)
  values
    (v_inv.organization_id, p_invoice, p_monto, p_forma, auth.uid());

  select coalesce(sum(monto), 0) into v_pagado
    from supplier_invoice_payments where supplier_invoice_id = p_invoice;
  v_saldo := v_inv.total - v_pagado;

  if v_saldo <= 0 then
    v_status := 'pagada';
  else
    v_status := 'pago_parcial';
  end if;

  update supplier_invoices set saldo = v_saldo, status = v_status, updated_at = now()
   where id = p_invoice returning * into v_inv;

  -- El pago baja lo que le debemos al proveedor (CxP).
  update suppliers set balance = balance - p_monto where id = v_inv.supplier_id;

  perform app.log_audit('supplier_invoice', v_inv.id::text, 'pago',
    jsonb_build_object('monto', p_monto, 'forma', p_forma, 'saldo', v_saldo, 'status', v_status),
    v_inv.organization_id);

  return v_inv;
end; $$;

create or replace function public.registrar_pago_compra(
  p_invoice uuid, p_monto numeric, p_forma text
) returns supplier_invoices
language plpgsql security definer set search_path = public, app as $$
begin
  return app.registrar_pago_compra(p_invoice, p_monto, p_forma);
end; $$;
grant execute on function public.registrar_pago_compra(uuid, numeric, text) to authenticated, service_role;


-- ============================================================================
-- E · MÓDULO `compras` + RBAC + RLS por operación + grants base — C1.4
-- ============================================================================

-- Registro del módulo nuevo (core=false; sort 13, route_prefix 'compras').
insert into modules (id, key, name, icon, route_prefix, core, sort) values
  ('c0000000-0000-0000-0000-00000000000d','compras','Compras',
   'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 4h12M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z',
   'compras',false,13)
on conflict (key) do nothing;

-- Agrega 'compras' a los default_modules de la vertical inventario_pesado
-- (guard idempotente).
update verticals
   set default_modules = default_modules || '["compras"]'::jsonb
 where key = 'inventario_pesado'
   and not default_modules @> '["compras"]'::jsonb;

-- Activa el módulo en los tenants existentes de esa vertical.
insert into organization_modules (organization_id, module_id, enabled)
select o.id, m.id, true
  from organizations o
  join verticals v on v.id = o.vertical_id and v.key = 'inventario_pesado'
  cross join modules m
 where m.key = 'compras'
on conflict (organization_id, module_id) do nothing;

-- Seed de defaults globales de role_permissions (organization_id NULL) para el
-- módulo 'compras' × 3 roles × 5 acciones (misma lógica que 0010/0012).
insert into role_permissions (organization_id, role, module_key, action, allowed)
select
  null, r.role, m.module_key, a.action,
  case
    when r.role = 'tenant_admin' then true
    when r.role = 'tenant_user'  then a.action in ('ver','crear','editar')
    else a.action = 'ver'   -- tenant_viewer
  end
from unnest(array['tenant_admin','tenant_user','tenant_viewer']::user_role[]) as r(role)
cross join unnest(array['compras']) as m(module_key)
cross join unnest(array['ver','crear','editar','cancelar','configurar']) as a(action)
on conflict do nothing;

-- RLS por operación (patrón idéntico al DO-loop de 0010/0012/0014), módulo 'compras'.
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('suppliers',                 'compras'),
      ('purchase_orders',           'compras'),
      ('purchase_order_items',      'compras'),
      ('supplier_invoices',         'compras'),
      ('supplier_invoice_payments', 'compras')
    ) as t(tbl, mod)
  loop
    execute format('alter table %I enable row level security;', rec.tbl);

    execute format('drop policy if exists %I on %I;', rec.tbl || '_select', rec.tbl);
    execute format($f$
      create policy %I on %I
        for select to authenticated
        using (
          (app.is_super_admin() or organization_id = app.current_org_id())
          and app.org_has_module(%L) and app.has_perm(%L, 'ver')
        );
    $f$, rec.tbl || '_select', rec.tbl, rec.mod, rec.mod);

    execute format('drop policy if exists %I on %I;', rec.tbl || '_insert', rec.tbl);
    execute format($f$
      create policy %I on %I
        for insert to authenticated
        with check (
          (app.is_super_admin() or organization_id = app.current_org_id())
          and app.org_has_module(%L) and app.has_perm(%L, 'crear')
        );
    $f$, rec.tbl || '_insert', rec.tbl, rec.mod, rec.mod);

    execute format('drop policy if exists %I on %I;', rec.tbl || '_update', rec.tbl);
    execute format($f$
      create policy %I on %I
        for update to authenticated
        using (
          (app.is_super_admin() or organization_id = app.current_org_id())
          and app.has_perm(%L, 'editar')
        )
        with check (
          app.is_super_admin() or organization_id = app.current_org_id()
        );
    $f$, rec.tbl || '_update', rec.tbl, rec.mod);

    execute format('drop policy if exists %I on %I;', rec.tbl || '_delete', rec.tbl);
    execute format($f$
      create policy %I on %I
        for delete to authenticated
        using ( app.is_super_admin() );
    $f$, rec.tbl || '_delete', rec.tbl);
  end loop;
end $$;


-- ============================================================================
-- F · Grants base (idéntico al bloque de 0010/0012/0014 — idempotente y seguro).
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables      in schema public to anon, authenticated, service_role;
grant all on all sequences   in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all     on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all     on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;


-- ============================================================================
-- ROLLBACK: (documentación, no ejecutable — orden inverso seguro)
--
-- -- E) RLS + módulo + permisos
-- do $$ declare t text; begin
--   foreach t in array array['suppliers','purchase_orders','purchase_order_items',
--     'supplier_invoices','supplier_invoice_payments'] loop
--     execute format('drop policy if exists %I on %I;', t || '_select', t);
--     execute format('drop policy if exists %I on %I;', t || '_insert', t);
--     execute format('drop policy if exists %I on %I;', t || '_update', t);
--     execute format('drop policy if exists %I on %I;', t || '_delete', t);
--   end loop;
-- end $$;
-- delete from role_permissions where organization_id is null and module_key = 'compras';
-- delete from organization_modules where module_id = 'c0000000-0000-0000-0000-00000000000d';
-- update verticals set default_modules = default_modules - 'compras' where key = 'inventario_pesado';
-- delete from modules where key = 'compras';
--
-- -- D) CxP
-- drop function if exists public.registrar_pago_compra(uuid, numeric, text);
-- drop function if exists app.registrar_pago_compra(uuid, numeric, text);
-- drop table if exists supplier_invoice_payments;
-- drop table if exists supplier_invoices;
--
-- -- C) órdenes de compra
-- drop function if exists public.recibir_compra(uuid, jsonb);
-- drop function if exists app.recibir_compra(uuid, jsonb);
-- drop table if exists purchase_order_items;
-- drop table if exists purchase_orders;
--
-- -- B) proveedores
-- drop table if exists suppliers;
--
-- -- A) folios: restaurar el CASE sin 'purchase' (cuerpo de 0014) y limpiar serie
-- delete from org_series where doc_type = 'purchase';
-- -- create or replace function app.next_serie_folio(...) ... (CASE de 0014)
-- ============================================================================
