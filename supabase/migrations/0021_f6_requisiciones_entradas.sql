-- ============================================================================
-- Aplika.ai — 0021 · FASE 6 Requisiciones y Órdenes de Entrada · Contrato F6 C1
-- Completa la cadena de abasto y CAMBIA la política de entrada de inventario:
-- las **Órdenes de Entrada son el ÚNICO camino de entrada de stock**. Todo lo que
-- sube inventario (compras, manual, ajuste, devolución) pasa por una Orden de
-- Entrada que el operador APLICA con `aplicar_entrada` ⇒ invoca
-- public.adjust_inventory('entrada',…) ⇒ sube el costo promedio ponderado (F2).
--
-- Requisiciones → módulo RBAC `compras` (ya existe, 0019).
-- Órdenes de entrada → módulo RBAC `inventario` (ya existe, 0014).
--
-- Reutiliza los patrones de F0/F1/F2/F5 (0010/0012/0014/0019): app.* SECURITY
-- DEFINER + wrapper public.*, app.has_perm / app.org_has_module, app.assert_org,
-- app.log_audit, next_serie_folio, RLS por operación (DO-loop), grants base.
-- Requiere 0020_f6_enums.sql (enums ya committeados).
--
-- DESVIACIONES / NOTAS respecto a C1 (documentadas):
--  · next_serie_folio gana las ramas 'requisition'→'REQ' y 'entry'→'OE' en su
--    CASE de prefijo (additivo; conserva TODOS los casos previos:
--    quote/order/sales_note/invoice/count/transfer/purchase). El wrapper
--    public.next_serie_folio de 0012 sigue válido (delega en app.*).
--  · aplicar_entrada sólo aplica ENTRADA a partidas con product_variant_id NO
--    nulo (una partida sin variante no mueve inventario), igual que
--    recibir_compra. El recálculo del estado de la OC ligada considera TODAS las
--    partidas de esa OC (misma lógica que recibir_compra).
--  · qty/unit_cost son numeric(14,3)/(14,4) (coherente con purchase items); la
--    entrada a inventario se redondea a entero (inventory.stock INTEGER), igual
--    que recibir_compra (round(qty)::int).
--  · recibir_compra (F5, 0019) queda OBSOLETA: la UI ya no la llama (la recepción
--    se hace generando una Orden de Entrada ligada a la OC). NO se borra (se
--    conserva por compatibilidad y trazabilidad histórica).
-- ============================================================================


-- ============================================================================
-- A · next_serie_folio v4 — misma lógica de 0012/0014/0019 + prefijos
--     'requisition'→'REQ' y 'entry'→'OE' (additivo). El wrapper public.* de 0012
--     sigue válido. Seed de las series para orgs existentes.
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
    when 'quote'       then 'COT'
    when 'order'       then 'PED'
    when 'sales_note'  then 'REM'
    when 'invoice'     then 'FAC'
    when 'count'       then 'CONT'   -- F2: conteos físicos
    when 'transfer'    then 'TRAS'   -- F2: traspasos entre almacenes
    when 'purchase'    then 'OC'     -- F5: órdenes de compra
    when 'requisition' then 'REQ'    -- F6: requisiciones de compra
    when 'entry'       then 'OE'     -- F6: órdenes de entrada
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

-- Seed de las series F6 para las orgs existentes (patrón del seed de 0012/0014/0019).
-- Las orgs futuras autocrean la serie vía next_serie_folio (prefijo correcto).
insert into org_series (organization_id, doc_type, serie, prefix, next_value)
select o.id, 'requisition', 'A', 'REQ', 1
  from organizations o
on conflict (organization_id, doc_type, serie) do nothing;

insert into org_series (organization_id, doc_type, serie, prefix, next_value)
select o.id, 'entry', 'A', 'OE', 1
  from organizations o
on conflict (organization_id, doc_type, serie) do nothing;


-- ============================================================================
-- B · REQUISICIONES (requisitions + requisition_items) — módulo `compras` · C1
-- ============================================================================
create table if not exists requisitions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  folio           text not null,                      -- next_serie_folio(org,'requisition') → 'REQ-A-0001'
  status          requisition_status not null default 'borrador',
  notas           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, folio)
);
create index if not exists idx_req_org_status on requisitions(organization_id, status);
create index if not exists idx_req_org_created on requisitions(organization_id, created_at desc);

create table if not exists requisition_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  requisition_id     uuid not null references requisitions(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  sku                text,
  name               text not null,
  qty                numeric(14,3) not null check (qty > 0),
  estimated_cost     numeric(14,4)
);
create index if not exists idx_reqi_org on requisition_items(organization_id);
create index if not exists idx_reqi_req on requisition_items(requisition_id);

drop trigger if exists trg_requisitions_touch on requisitions;
create trigger trg_requisitions_touch before update on requisitions
  for each row execute function app.touch_updated_at();

-- Aprueba una requisición: 'borrador' → 'aprobada'. Requiere compras/editar.
create or replace function app.aprobar_requisicion(
  p_req uuid
) returns requisitions
language plpgsql security definer set search_path = public, app as $$
declare
  v_req requisitions;
begin
  select * into v_req from requisitions where id = p_req for update;
  if v_req is null then raise exception 'requisición no encontrada'; end if;
  perform app.assert_org(v_req.organization_id);

  if not app.has_perm('compras','editar') then
    raise exception 'forbidden: falta permiso compras/editar' using errcode = '42501';
  end if;
  if v_req.status <> 'borrador' then
    raise exception 'la requisición % no admite aprobación (estado %)', v_req.folio, v_req.status;
  end if;

  update requisitions set status = 'aprobada', updated_at = now()
   where id = p_req returning * into v_req;

  perform app.log_audit('requisition', v_req.id::text, 'aprobar',
    jsonb_build_object('status', v_req.status), v_req.organization_id);

  return v_req;
end; $$;

create or replace function public.aprobar_requisicion(p_req uuid)
returns requisitions
language plpgsql security definer set search_path = public, app as $$
begin
  return app.aprobar_requisicion(p_req);
end; $$;
grant execute on function public.aprobar_requisicion(uuid) to authenticated, service_role;


-- ============================================================================
-- C · ÓRDENES DE ENTRADA (entry_orders + entry_order_items) — módulo `inventario`
--     · C1. Único camino de entrada de inventario.
-- ============================================================================
create table if not exists entry_orders (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  folio             text not null,                    -- next_serie_folio(org,'entry') → 'OE-A-0001'
  warehouse_id      uuid not null references warehouses(id),
  origin            text not null default 'manual'
                      check (origin in ('compra','manual','ajuste','devolucion')),
  purchase_order_id uuid references purchase_orders(id),   -- ligada a una OC (origin 'compra')
  status            entry_order_status not null default 'borrador',
  notas             text,
  created_by        uuid references profiles(id),
  applied_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, folio)
);
create index if not exists idx_eo_org_status on entry_orders(organization_id, status);
create index if not exists idx_eo_org_created on entry_orders(organization_id, created_at desc);
create index if not exists idx_eo_po on entry_orders(purchase_order_id);

create table if not exists entry_order_items (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations(id) on delete cascade,
  entry_order_id         uuid not null references entry_orders(id) on delete cascade,
  purchase_order_item_id uuid references purchase_order_items(id),  -- liga a la partida de OC
  product_variant_id     uuid references product_variants(id),
  sku                    text,
  name                   text not null,
  qty                    numeric(14,3) not null check (qty > 0),
  unit_cost              numeric(14,4)
);
create index if not exists idx_eoi_org on entry_order_items(organization_id);
create index if not exists idx_eoi_eo on entry_order_items(entry_order_id);
create index if not exists idx_eoi_poi on entry_order_items(purchase_order_item_id);

drop trigger if exists trg_entry_orders_touch on entry_orders;
create trigger trg_entry_orders_touch before update on entry_orders
  for each row execute function app.touch_updated_at();

-- Aplica una Orden de Entrada (ÚNICO camino de entrada de inventario):
--  · por cada partida con variante ⇒ adjust_inventory('entrada',…) con el
--    unit_cost de la partida ⇒ sube stock y costo promedio (F2);
--  · si la partida liga a una partida de OC (purchase_order_item_id) ⇒ suma a
--    qty_received de esa partida;
--  · si la OE liga a una OC (purchase_order_id) ⇒ recalcula el estado de la OC
--    (recibida / recibida_parcial) sobre TODAS sus partidas (como recibir_compra);
--  · status 'aplicada', applied_at; audita.
create or replace function app.aplicar_entrada(
  p_eo uuid
) returns entry_orders
language plpgsql security definer set search_path = public, app as $$
declare
  v_eo     entry_orders;
  v_item   entry_order_items;
  v_total  int;
  v_full   int;
  v_any    int;
  v_status purchase_order_status;
begin
  select * into v_eo from entry_orders where id = p_eo for update;
  if v_eo is null then raise exception 'orden de entrada no encontrada'; end if;
  perform app.assert_org(v_eo.organization_id);

  if not app.has_perm('inventario','editar') then
    raise exception 'forbidden: falta permiso inventario/editar' using errcode = '42501';
  end if;
  if v_eo.status <> 'borrador' then
    raise exception 'la orden de entrada % no admite aplicación (estado %)', v_eo.folio, v_eo.status;
  end if;

  -- Aplica cada partida.
  for v_item in
    select * from entry_order_items where entry_order_id = p_eo
  loop
    -- Sólo mueve inventario si la partida tiene variante. El costo promedio sube
    -- con el unit_cost real de la entrada.
    if v_item.product_variant_id is not null then
      perform public.adjust_inventory(
        v_item.product_variant_id, v_eo.warehouse_id, round(v_item.qty)::int, 'entrada',
        'Entrada ' || v_eo.folio, 'entry', v_eo.id, v_item.unit_cost
      );
    end if;

    -- Si liga a una partida de OC, suma a lo recibido de esa partida.
    if v_item.purchase_order_item_id is not null then
      update purchase_order_items
         set qty_received = qty_received + v_item.qty
       where id = v_item.purchase_order_item_id;
    end if;
  end loop;

  -- Si la OE liga a una OC, recalcula su estado sobre TODAS sus partidas
  -- (misma lógica que recibir_compra en 0019).
  if v_eo.purchase_order_id is not null then
    select count(*),
           count(*) filter (where qty_received >= qty),
           count(*) filter (where qty_received > 0)
      into v_total, v_full, v_any
      from purchase_order_items where purchase_order_id = v_eo.purchase_order_id;

    if v_total > 0 and v_full = v_total then
      v_status := 'recibida';
    elsif v_any > 0 then
      v_status := 'recibida_parcial';
    else
      v_status := null;   -- nada recibido ⇒ sin cambio
    end if;

    if v_status is not null then
      update purchase_orders set status = v_status, updated_at = now()
       where id = v_eo.purchase_order_id;
    end if;
  end if;

  update entry_orders set status = 'aplicada', applied_at = now(), updated_at = now()
   where id = p_eo returning * into v_eo;

  perform app.log_audit('entry_order', v_eo.id::text, 'aplicar',
    jsonb_build_object('folio', v_eo.folio, 'status', v_eo.status,
                       'purchase_order_id', v_eo.purchase_order_id),
    v_eo.organization_id);

  return v_eo;
end; $$;

create or replace function public.aplicar_entrada(p_eo uuid)
returns entry_orders
language plpgsql security definer set search_path = public, app as $$
begin
  return app.aplicar_entrada(p_eo);
end; $$;
grant execute on function public.aplicar_entrada(uuid) to authenticated, service_role;


-- ============================================================================
-- D · RLS por operación (patrón idéntico al DO-loop de 0010/0012/0014/0019).
--     Requisiciones → módulo 'compras'; Órdenes de entrada → módulo 'inventario'.
--     Ambos módulos y sus role_permissions ya existen (0014/0019); no se re-siembran.
-- ============================================================================
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('requisitions',      'compras'),
      ('requisition_items', 'compras'),
      ('entry_orders',      'inventario'),
      ('entry_order_items', 'inventario')
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
-- E · Grants base (idéntico al bloque de 0010/0012/0014/0019 — idempotente).
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
-- -- D) RLS
-- do $$ declare t text; begin
--   foreach t in array array['requisitions','requisition_items',
--     'entry_orders','entry_order_items'] loop
--     execute format('drop policy if exists %I on %I;', t || '_select', t);
--     execute format('drop policy if exists %I on %I;', t || '_insert', t);
--     execute format('drop policy if exists %I on %I;', t || '_update', t);
--     execute format('drop policy if exists %I on %I;', t || '_delete', t);
--   end loop;
-- end $$;
--
-- -- C) órdenes de entrada
-- drop function if exists public.aplicar_entrada(uuid);
-- drop function if exists app.aplicar_entrada(uuid);
-- drop table if exists entry_order_items;
-- drop table if exists entry_orders;
--
-- -- B) requisiciones
-- drop function if exists public.aprobar_requisicion(uuid);
-- drop function if exists app.aprobar_requisicion(uuid);
-- drop table if exists requisition_items;
-- drop table if exists requisitions;
--
-- -- A) folios: restaurar el CASE sin 'requisition'/'entry' (cuerpo de 0019) y
-- --    limpiar las series sembradas.
-- delete from org_series where doc_type in ('requisition','entry');
-- -- create or replace function app.next_serie_folio(...) ... (CASE de 0019)
-- ============================================================================
