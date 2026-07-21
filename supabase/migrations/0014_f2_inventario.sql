-- ============================================================================
-- Aplika.ai — 0014 · FASE 2 Inventario · Contrato F2 C1.1–C1.5
-- Additiva y no destructiva sobre el inventario de F0 (inventory /
-- inventory_movements / adjust_inventory). Añade:
--   · Costeo promedio ponderado por (variante, almacén) + snapshots de kardex.
--   · adjust_inventory v2 (arg opcional p_unit_cost al final; firma vieja de 7
--     args sigue válida vía default ⇒ apply_order_stock intacto).
--   · Conteos físicos (inventory_counts / _items + aplicar_conteo).
--   · Traspasos entre almacenes en 2 pasos (enviar/recibir/cancelar).
--   · Folios ('count','CONT') / ('transfer','TRAS'), RLS por operación
--     (módulo 'inventario'), grants base.
-- Reutiliza los patrones de F0/F1: app.* SECURITY DEFINER + wrapper public.*,
-- app.has_perm / app.org_has_module, app.assert_org, app.log_audit,
-- next_serie_folio, RLS por operación (DO-loop de 0010/0012).
--
-- DESVIACIONES respecto a C1 (documentadas):
--  · next_serie_folio (0012) gana 2 ramas en su CASE de prefijo:
--    'count'→'CONT' y 'transfer'→'TRAS'. Additivo (no altera los doc_types
--    previos); asegura el prefijo correcto también cuando la serie se autocrea
--    para una org NO sembrada (p.ej. orgs futuras o tests en su propia tx).
--  · cancelar_traspaso: C1.4 no define columna para el motivo; el p_motivo se
--    persiste en audit_log (detail) — no se agregan columnas fuera de C1.4.
--  · adjust_inventory se implementa como app.adjust_inventory (lógica) + wrapper
--    public.adjust_inventory (ambos SECURITY DEFINER). 0003 la definía sólo en
--    public; se DROPa la firma vieja de 7 args ANTES de recrear la de 8 (no se
--    puede cambiar el nº de args con create or replace, y coexistir haría
--    ambigua la llamada de 7 args de apply_order_stock).
-- ============================================================================


-- ============================================================================
-- A · ENUMS NUEVOS (no hay ALTER de enums existentes; movement_type NO cambia).
--     DO/EXCEPTION ⇒ idempotente (no existe `create type if not exists`).
-- ============================================================================
do $$ begin
  create type inventory_count_status as enum ('borrador','en_conteo','aplicado','cancelada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type inventory_transfer_status as enum ('borrador','en_transito','recibido','cancelada');
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- B · COSTEO — columnas additivas (idempotentes)
-- ============================================================================
alter table inventory
  add column if not exists avg_cost numeric(14,4) not null default 0;  -- costo promedio (variante+almacén)

alter table inventory_movements
  add column if not exists unit_cost      numeric(14,4),   -- costo unitario del movimiento (entrada) o COGS (salida)
  add column if not exists avg_cost_after numeric(14,4),   -- costo promedio tras el movimiento (snapshot kardex)
  add column if not exists balance_after  integer;         -- saldo de stock tras el movimiento (snapshot kardex)


-- ============================================================================
-- C · next_serie_folio v2 — misma lógica de 0012 + prefijos de F2.
--     Sólo se extiende el CASE del prefijo (additivo). El wrapper public.* de
--     0012 sigue válido (delega en app.next_serie_folio).
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


-- ============================================================================
-- D · adjust_inventory v2 — costeo promedio ponderado + snapshots de kardex.
--     Firma de 8 args (p_unit_cost opcional al final); la llamada de 7 args de
--     apply_order_stock resuelve por el default.
-- ============================================================================

-- Se DROPa la firma vieja de 7 args (0003) para poder recrear con 8 args sin
-- ambigüedad. `app.` equivalente con if exists (no existía) por simetría.
drop function if exists public.adjust_inventory(uuid,uuid,integer,movement_type,text,text,uuid);
drop function if exists app.adjust_inventory(uuid,uuid,integer,movement_type,text,text,uuid);

create or replace function app.adjust_inventory(
  p_variant   uuid,
  p_warehouse uuid,
  p_qty       integer,
  p_type      movement_type default 'ajuste',
  p_reason    text default null,
  p_ref_type  text default 'adjustment',
  p_ref_id    uuid default null,
  p_unit_cost numeric default null
) returns inventory
language plpgsql security definer set search_path = public, app as $$
declare
  v_org           uuid;
  v_inv           inventory;
  v_allow_back    boolean;
  v_old_stock     integer;
  v_old_avg       numeric(14,4);
  v_new_stock     integer;
  v_new_avg       numeric(14,4);
  v_mov_unit_cost numeric(14,4);
begin
  select organization_id into v_org from product_variants where id = p_variant;
  if v_org is null then raise exception 'variant not found'; end if;
  perform app.assert_org(v_org);

  select allow_backorder into v_allow_back from organizations where id = v_org;

  -- Crea la fila de inventario si falta (mismo comportamiento que 0003).
  insert into inventory (organization_id, product_variant_id, warehouse_id, stock)
  values (v_org, p_variant, p_warehouse, 0)
  on conflict (product_variant_id, warehouse_id) do nothing;

  select * into v_inv from inventory
   where product_variant_id = p_variant and warehouse_id = p_warehouse for update;

  v_old_stock := v_inv.stock;
  v_old_avg   := coalesce(v_inv.avg_cost, 0);
  v_new_stock := v_old_stock + p_qty;

  -- Costeo promedio ponderado por (variante, almacén):
  --  · Entrada / ajuste positivo CON costo ⇒ recalcula el promedio.
  --    greatest(old,0): si el stock previo era ≤0 el promedio arranca en el
  --    costo de la entrada (equivale a new_avg = p_unit_cost).
  --  · Salida, o entrada/ajuste SIN costo ⇒ el promedio no cambia; el
  --    movimiento sale al promedio actual (COGS).
  if p_qty > 0 and p_unit_cost is not null then
    if v_new_stock > 0 then
      v_new_avg := round(
        (greatest(v_old_stock, 0) * v_old_avg + p_qty * p_unit_cost)
        / (greatest(v_old_stock, 0) + p_qty), 4);
    else
      v_new_avg := p_unit_cost;   -- borde: entrada que no revierte un stock muy negativo
    end if;
    v_mov_unit_cost := p_unit_cost;
  else
    v_new_avg       := v_old_avg;
    v_mov_unit_cost := v_old_avg;
  end if;

  -- Validación allow_backorder (idéntica a 0003, mismo texto y errcode).
  if v_new_stock < 0 and not v_allow_back then
    raise exception 'insufficient stock for variant % (have %, need %)',
      p_variant, v_old_stock, abs(p_qty) using errcode = 'P0001';
  end if;

  update inventory
     set stock = v_new_stock, avg_cost = v_new_avg, updated_at = now()
   where id = v_inv.id
   returning * into v_inv;

  insert into inventory_movements
    (organization_id, product_variant_id, warehouse_id, type, qty, reason,
     ref_type, ref_id, created_by, unit_cost, avg_cost_after, balance_after)
  values
    (v_org, p_variant, p_warehouse, p_type, p_qty, p_reason,
     p_ref_type, p_ref_id, auth.uid(), v_mov_unit_cost, v_new_avg, v_new_stock);

  return v_inv;
end; $$;

-- Wrapper público (plpgsql para evitar inlining/multi-evaluación de una función
-- con efectos secundarios). apply_order_stock (0003) llama con 7 args ⇒ resuelve
-- por el default de p_unit_cost.
create or replace function public.adjust_inventory(
  p_variant   uuid,
  p_warehouse uuid,
  p_qty       integer,
  p_type      movement_type default 'ajuste',
  p_reason    text default null,
  p_ref_type  text default 'adjustment',
  p_ref_id    uuid default null,
  p_unit_cost numeric default null
) returns inventory
language plpgsql security definer set search_path = public, app as $$
begin
  return app.adjust_inventory(p_variant, p_warehouse, p_qty, p_type,
                              p_reason, p_ref_type, p_ref_id, p_unit_cost);
end; $$;

grant execute on function public.adjust_inventory(uuid,uuid,integer,movement_type,text,text,uuid,numeric)
  to authenticated, service_role;


-- ============================================================================
-- E · CONTEOS FÍSICOS (inventory_counts + inventory_count_items) — C1.3
-- ============================================================================
create table if not exists inventory_counts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  folio           text not null,                       -- next_serie_folio(org,'count') → 'CONT-A-0001'
  warehouse_id    uuid not null references warehouses(id),
  status          inventory_count_status not null default 'borrador',
  notas           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  applied_at      timestamptz,
  unique (organization_id, folio)
);
create index if not exists idx_inv_counts_org_status on inventory_counts(organization_id, status);
create index if not exists idx_inv_counts_org_created on inventory_counts(organization_id, created_at desc);

create table if not exists inventory_count_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  count_id           uuid not null references inventory_counts(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id),
  system_qty         integer not null default 0,       -- snapshot del stock al capturar
  counted_qty        integer,                            -- lo contado (null = pendiente)
  unique (count_id, product_variant_id)
);
create index if not exists idx_inv_count_items_org on inventory_count_items(organization_id);
create index if not exists idx_inv_count_items_count on inventory_count_items(count_id);

-- Aplica un conteo: por cada partida capturada con diferencia genera un 'ajuste'
-- (que NO altera el costo promedio: p_unit_cost null ⇒ COGS al promedio), marca
-- el conteo 'aplicado' y audita. Sin diferencias ⇒ ningún movimiento.
create or replace function app.aplicar_conteo(p_count uuid)
returns inventory_counts
language plpgsql security definer set search_path = public, app as $$
declare
  v_count inventory_counts;
  it      record;
  v_ajustes int := 0;
begin
  select * into v_count from inventory_counts where id = p_count for update;
  if v_count is null then raise exception 'conteo no encontrado'; end if;
  perform app.assert_org(v_count.organization_id);

  if not app.has_perm('inventario','editar') then
    raise exception 'forbidden: falta permiso inventario/editar' using errcode = '42501';
  end if;
  if v_count.status not in ('borrador','en_conteo') then
    raise exception 'el conteo % no admite aplicación (estado %)', v_count.folio, v_count.status;
  end if;

  for it in
    select product_variant_id, system_qty, counted_qty
      from inventory_count_items
     where count_id = p_count
       and counted_qty is not null
       and counted_qty <> system_qty
  loop
    perform public.adjust_inventory(
      it.product_variant_id, v_count.warehouse_id,
      it.counted_qty - it.system_qty, 'ajuste',
      'Conteo ' || v_count.folio, 'count', v_count.id
    );
    v_ajustes := v_ajustes + 1;
  end loop;

  update inventory_counts
     set status = 'aplicado', applied_at = now()
   where id = p_count
   returning * into v_count;

  perform app.log_audit('inventory_count', v_count.id::text, 'aplicar',
    jsonb_build_object('folio', v_count.folio, 'ajustes', v_ajustes),
    v_count.organization_id);

  return v_count;
end; $$;

create or replace function public.aplicar_conteo(p_count uuid)
returns inventory_counts
language plpgsql security definer set search_path = public, app as $$
begin
  return app.aplicar_conteo(p_count);
end; $$;
grant execute on function public.aplicar_conteo(uuid) to authenticated, service_role;


-- ============================================================================
-- F · TRASPASOS ENTRE ALMACENES (inventory_transfers + _items) — C1.4
-- ============================================================================
create table if not exists inventory_transfers (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  folio             text not null,                     -- next_serie_folio(org,'transfer') → 'TRAS-A-0001'
  from_warehouse_id uuid not null references warehouses(id),
  to_warehouse_id   uuid not null references warehouses(id),
  status            inventory_transfer_status not null default 'borrador',
  notas             text,
  created_by        uuid references profiles(id),
  created_at        timestamptz not null default now(),
  shipped_at        timestamptz,
  received_at       timestamptz,
  check (from_warehouse_id <> to_warehouse_id),
  unique (organization_id, folio)
);
create index if not exists idx_inv_transfers_org_status on inventory_transfers(organization_id, status);
create index if not exists idx_inv_transfers_org_created on inventory_transfers(organization_id, created_at desc);

create table if not exists inventory_transfer_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  transfer_id        uuid not null references inventory_transfers(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id),
  qty                integer not null check (qty > 0),
  unit_cost          numeric(14,4)                      -- costo del origen capturado al enviar (viaja al destino)
);
create index if not exists idx_inv_transfer_items_org on inventory_transfer_items(organization_id);
create index if not exists idx_inv_transfer_items_transfer on inventory_transfer_items(transfer_id);

-- Enviar: salida del origen (en_transito). Antes de la salida captura en el item
-- el avg_cost actual del origen (costo que "viaja" al destino).
create or replace function app.enviar_traspaso(p_transfer uuid)
returns inventory_transfers
language plpgsql security definer set search_path = public, app as $$
declare
  v_tr      inventory_transfers;
  it        record;
  v_src_avg numeric(14,4);
begin
  select * into v_tr from inventory_transfers where id = p_transfer for update;
  if v_tr is null then raise exception 'traspaso no encontrado'; end if;
  perform app.assert_org(v_tr.organization_id);

  if not app.has_perm('inventario','editar') then
    raise exception 'forbidden: falta permiso inventario/editar' using errcode = '42501';
  end if;
  if v_tr.status <> 'borrador' then
    raise exception 'el traspaso % no está en borrador (estado %)', v_tr.folio, v_tr.status;
  end if;

  for it in
    select id, product_variant_id, qty from inventory_transfer_items
     where transfer_id = p_transfer
  loop
    -- costo del origen (variante, from_warehouse) que viaja con la mercancía
    select avg_cost into v_src_avg from inventory
     where product_variant_id = it.product_variant_id
       and warehouse_id = v_tr.from_warehouse_id;
    v_src_avg := coalesce(v_src_avg, 0);

    update inventory_transfer_items set unit_cost = v_src_avg where id = it.id;

    perform public.adjust_inventory(
      it.product_variant_id, v_tr.from_warehouse_id, -it.qty, 'salida',
      'Traspaso ' || v_tr.folio, 'transfer', v_tr.id
    );
  end loop;

  update inventory_transfers
     set status = 'en_transito', shipped_at = now()
   where id = p_transfer
   returning * into v_tr;

  perform app.log_audit('inventory_transfer', v_tr.id::text, 'enviar',
    jsonb_build_object('folio', v_tr.folio), v_tr.organization_id);

  return v_tr;
end; $$;

create or replace function public.enviar_traspaso(p_transfer uuid)
returns inventory_transfers
language plpgsql security definer set search_path = public, app as $$
begin
  return app.enviar_traspaso(p_transfer);
end; $$;
grant execute on function public.enviar_traspaso(uuid) to authenticated, service_role;

-- Recibir: entrada al destino con el costo que viajó (item.unit_cost). Recalcula
-- el promedio del almacén destino.
create or replace function app.recibir_traspaso(p_transfer uuid)
returns inventory_transfers
language plpgsql security definer set search_path = public, app as $$
declare
  v_tr inventory_transfers;
  it   record;
begin
  select * into v_tr from inventory_transfers where id = p_transfer for update;
  if v_tr is null then raise exception 'traspaso no encontrado'; end if;
  perform app.assert_org(v_tr.organization_id);

  if not app.has_perm('inventario','editar') then
    raise exception 'forbidden: falta permiso inventario/editar' using errcode = '42501';
  end if;
  if v_tr.status <> 'en_transito' then
    raise exception 'el traspaso % no está en tránsito (estado %)', v_tr.folio, v_tr.status;
  end if;

  for it in
    select product_variant_id, qty, unit_cost from inventory_transfer_items
     where transfer_id = p_transfer
  loop
    perform public.adjust_inventory(
      it.product_variant_id, v_tr.to_warehouse_id, it.qty, 'entrada',
      'Traspaso ' || v_tr.folio, 'transfer', v_tr.id, it.unit_cost
    );
  end loop;

  update inventory_transfers
     set status = 'recibido', received_at = now()
   where id = p_transfer
   returning * into v_tr;

  perform app.log_audit('inventory_transfer', v_tr.id::text, 'recibir',
    jsonb_build_object('folio', v_tr.folio), v_tr.organization_id);

  return v_tr;
end; $$;

create or replace function public.recibir_traspaso(p_transfer uuid)
returns inventory_transfers
language plpgsql security definer set search_path = public, app as $$
begin
  return app.recibir_traspaso(p_transfer);
end; $$;
grant execute on function public.recibir_traspaso(uuid) to authenticated, service_role;

-- Cancelar: sólo desde 'borrador'. Cancelar un traspaso 'en_transito' exige
-- recibir o reversar la mercancía y queda FUERA de alcance F2. El motivo se
-- registra en audit_log (C1.4 no define columna para persistirlo).
create or replace function app.cancelar_traspaso(p_transfer uuid, p_motivo text)
returns inventory_transfers
language plpgsql security definer set search_path = public, app as $$
declare
  v_tr inventory_transfers;
begin
  select * into v_tr from inventory_transfers where id = p_transfer for update;
  if v_tr is null then raise exception 'traspaso no encontrado'; end if;
  perform app.assert_org(v_tr.organization_id);

  if not app.has_perm('inventario','cancelar') then
    raise exception 'forbidden: falta permiso inventario/cancelar' using errcode = '42501';
  end if;
  if v_tr.status <> 'borrador' then
    raise exception 'sólo se puede cancelar un traspaso en borrador (estado %); en tránsito requiere recibir o reversar (fuera de F2)', v_tr.status;
  end if;

  update inventory_transfers
     set status = 'cancelada'
   where id = p_transfer
   returning * into v_tr;

  perform app.log_audit('inventory_transfer', v_tr.id::text, 'cancelar',
    jsonb_build_object('folio', v_tr.folio, 'motivo', p_motivo),
    v_tr.organization_id);

  return v_tr;
end; $$;

create or replace function public.cancelar_traspaso(p_transfer uuid, p_motivo text)
returns inventory_transfers
language plpgsql security definer set search_path = public, app as $$
begin
  return app.cancelar_traspaso(p_transfer, p_motivo);
end; $$;
grant execute on function public.cancelar_traspaso(uuid, text) to authenticated, service_role;


-- ============================================================================
-- G · FOLIOS (seed org_series) + RLS por operación + grants base
-- ============================================================================

-- Seed de series F2 para las orgs existentes (patrón del seed de 0012). Las orgs
-- futuras autocrean la serie vía next_serie_folio (prefijo correcto por el CASE).
insert into org_series (organization_id, doc_type, serie, prefix, next_value)
select o.id, dt.doc_type, 'A', dt.prefix, 1
  from organizations o
  cross join (values ('count','CONT'), ('transfer','TRAS')) as dt(doc_type, prefix)
on conflict (organization_id, doc_type, serie) do nothing;

-- RLS por operación (patrón idéntico al DO-loop de 0010/0012), módulo 'inventario'.
-- inventory / inventory_movements ya tienen RLS (0010). Las 4 tablas nuevas se
-- gatean por el módulo 'inventario'.
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('inventory_counts',          'inventario'),
      ('inventory_count_items',     'inventario'),
      ('inventory_transfers',       'inventario'),
      ('inventory_transfer_items',  'inventario')
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
-- H · Grants base (idéntico al bloque de 0010/0012 — idempotente y seguro).
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
-- -- G) RLS + series
-- do $$ declare t text; begin
--   foreach t in array array['inventory_counts','inventory_count_items',
--     'inventory_transfers','inventory_transfer_items'] loop
--     execute format('drop policy if exists %I on %I;', t || '_select', t);
--     execute format('drop policy if exists %I on %I;', t || '_insert', t);
--     execute format('drop policy if exists %I on %I;', t || '_update', t);
--     execute format('drop policy if exists %I on %I;', t || '_delete', t);
--   end loop;
-- end $$;
-- delete from org_series where doc_type in ('count','transfer');
--
-- -- F) traspasos
-- drop function if exists public.cancelar_traspaso(uuid, text);
-- drop function if exists app.cancelar_traspaso(uuid, text);
-- drop function if exists public.recibir_traspaso(uuid);
-- drop function if exists app.recibir_traspaso(uuid);
-- drop function if exists public.enviar_traspaso(uuid);
-- drop function if exists app.enviar_traspaso(uuid);
-- drop table if exists inventory_transfer_items;
-- drop table if exists inventory_transfers;
--
-- -- E) conteos
-- drop function if exists public.aplicar_conteo(uuid);
-- drop function if exists app.aplicar_conteo(uuid);
-- drop table if exists inventory_count_items;
-- drop table if exists inventory_counts;
--
-- -- D) adjust_inventory: soltar la firma de 8 args y restaurar la de 7 (0003)
-- drop function if exists public.adjust_inventory(uuid,uuid,integer,movement_type,text,text,uuid,numeric);
-- drop function if exists app.adjust_inventory(uuid,uuid,integer,movement_type,text,text,uuid,numeric);
-- -- create or replace function public.adjust_inventory(...) ... (cuerpo de 0003)
--
-- -- C) next_serie_folio: restaurar el CASE sin 'count'/'transfer' (cuerpo de 0012)
--
-- -- B) costeo (soltar columnas additivas)
-- alter table inventory_movements drop column if exists balance_after,
--   drop column if exists avg_cost_after, drop column if exists unit_cost;
-- alter table inventory drop column if exists avg_cost;
--
-- -- A) enums
-- drop type if exists inventory_transfer_status;
-- drop type if exists inventory_count_status;
-- ============================================================================
