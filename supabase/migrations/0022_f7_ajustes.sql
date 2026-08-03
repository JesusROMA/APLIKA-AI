-- ============================================================================
-- Aplika.ai — 0022 · FASE 7 Ajustes de operación (C1 · F7-CONTRATOS.md)
-- Paquete de ajustes sobre F0–F6. Todo idempotente; conserva convenciones vigentes
-- (helpers app.*, patrón RLS DO-loop de 0010, grants base, seed org_series).
--
-- Contenido:
--  A · purchase_orders.requisition_id (FK real requisición ↔ OC).
--  B · enum prospect_stage + tabla crm_prospects (módulo `crm`) + trigger touch.
--  C · supplier_invoices.internal_folio (folio interno consecutivo de CxP).
--  D · next_serie_folio v5 — asegura 'invoice'→'FAC' y agrega 'supplier_invoice'→'FP'
--      (conserva TODOS los prefijos previos). Seed org_series para orgs existentes.
--  E · RLS por operación de crm_prospects (DO-loop, módulo `crm`).
--  F · Grants base.
-- ============================================================================


-- ============================================================================
-- A · Requisición ↔ OC — FK real (C1 · punto 2). Se llena al convertir.
-- ============================================================================
alter table purchase_orders
  add column if not exists requisition_id uuid references requisitions(id);
create index if not exists idx_po_org_requisition
  on purchase_orders(organization_id, requisition_id);


-- ============================================================================
-- B · CRM prospectos (C1.1) — enum + tabla, módulo `crm`.
--     El enum se declara con DO/EXCEPTION (idempotente, mismo criterio que 0018).
-- ============================================================================
do $$ begin
  create type prospect_stage as enum
    ('nuevo','contactado','propuesta','ganado','perdido');
exception when duplicate_object then null;
end $$;

create table if not exists crm_prospects (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  contact_name    text,
  phone           text,
  email           text,
  source          text,
  stage           prospect_stage not null default 'nuevo',
  notas           text,
  customer_id     uuid references customers(id),         -- se liga al convertir a cliente
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_crmp_org_stage on crm_prospects(organization_id, stage);
create index if not exists idx_crmp_org_created on crm_prospects(organization_id, created_at desc);
create index if not exists idx_crmp_customer on crm_prospects(customer_id);

drop trigger if exists trg_crm_prospects_touch on crm_prospects;
create trigger trg_crm_prospects_touch before update on crm_prospects
  for each row execute function app.touch_updated_at();


-- ============================================================================
-- C · CxP — folio interno consecutivo del proveedor (C1 · punto 6).
--     El `folio` existente sigue siendo el que emite el proveedor; internal_folio
--     será el consecutivo interno (next_serie_folio(org,'supplier_invoice') → FP).
-- ============================================================================
alter table supplier_invoices
  add column if not exists internal_folio text;


-- ============================================================================
-- D · next_serie_folio v5 — misma lógica de 0012/0014/0019/0021 + prefijo
--     'supplier_invoice'→'FP' (additivo; conserva TODOS los casos previos).
--     Se verifica que 'invoice'→'FAC' esté presente (la factura pasa a esta serie).
--     El wrapper public.next_serie_folio de 0012 sigue válido (delega en app.*).
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
    when 'quote'            then 'COT'
    when 'order'            then 'PED'
    when 'sales_note'       then 'REM'
    when 'invoice'          then 'FAC'    -- F1/F7: facturas (CxC) → serie FAC-A-####
    when 'count'            then 'CONT'   -- F2: conteos físicos
    when 'transfer'         then 'TRAS'   -- F2: traspasos entre almacenes
    when 'purchase'         then 'OC'     -- F5: órdenes de compra
    when 'requisition'      then 'REQ'    -- F6: requisiciones de compra
    when 'entry'            then 'OE'     -- F6: órdenes de entrada
    when 'supplier_invoice' then 'FP'     -- F7: folio interno de CxP (factura de proveedor)
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

-- Seed de las series F7 para las orgs existentes (patrón del seed de 0012/…/0021).
-- Se siembran TODOS los doc_types canónicos con on conflict do nothing: las orgs
-- que ya tenían la serie no se tocan; las que no, arrancan en 0001 con su prefijo.
-- Las orgs futuras autocrean la serie vía next_serie_folio (prefijo correcto).
insert into org_series (organization_id, doc_type, serie, prefix, next_value)
select o.id, d.doc_type, 'A', d.prefix, 1
  from organizations o
  cross join (values
    ('quote','COT'),
    ('order','PED'),
    ('invoice','FAC'),
    ('purchase','OC'),
    ('requisition','REQ'),
    ('entry','OE'),
    ('count','CONT'),
    ('transfer','TRAS'),
    ('supplier_invoice','FP')
  ) as d(doc_type, prefix)
on conflict (organization_id, doc_type, serie) do nothing;


-- ============================================================================
-- E · RLS por operación de crm_prospects (patrón idéntico al DO-loop de 0010/…).
--     Módulo 'crm' (ya sembrado en 0005/0010; sus role_permissions también).
-- ============================================================================
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('crm_prospects', 'crm')
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
-- F · Grants base (idéntico al bloque de 0010/0012/…/0021 — idempotente).
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
-- -- E) RLS crm_prospects
-- do $$ declare t text := 'crm_prospects'; begin
--   execute format('drop policy if exists %I on %I;', t || '_select', t);
--   execute format('drop policy if exists %I on %I;', t || '_insert', t);
--   execute format('drop policy if exists %I on %I;', t || '_update', t);
--   execute format('drop policy if exists %I on %I;', t || '_delete', t);
-- end $$;
--
-- -- D) folios: restaurar el CASE sin 'supplier_invoice' (cuerpo de 0021) y limpiar
-- --    las series sembradas por F7 (solo las que no existían antes).
-- delete from org_series where doc_type = 'supplier_invoice';
-- -- create or replace function app.next_serie_folio(...) ... (CASE de 0021)
--
-- -- C) CxP
-- alter table supplier_invoices drop column if exists internal_folio;
--
-- -- B) CRM
-- drop table if exists crm_prospects;
-- drop type if exists prospect_stage;
--
-- -- A) requisición ↔ OC
-- drop index if exists idx_po_org_requisition;
-- alter table purchase_orders drop column if exists requisition_id;
-- ============================================================================
