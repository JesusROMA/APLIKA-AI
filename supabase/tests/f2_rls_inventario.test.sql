-- ============================================================================
-- pgTAP — F2 · RLS / RBAC de inventario (0014 · C1.5)
--   · Un tenant SIN el módulo 'inventario' NO puede insertar en
--     inventory_counts (RLS ⇒ 42501).
--   · Un tenant_viewer (sin permiso 'editar') NO puede aplicar_conteo (42501).
--   · Un tenant_admin CON módulo 'inventario' SÍ puede insertar en
--     inventory_counts (control positivo).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(3);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org A: SIN módulo 'inventario'.
insert into organizations (id, slug, name) values
  ('a4000000-0000-0000-0000-000000000001','rlsinvA','RLS Inv A');
insert into warehouses (id, organization_id, name, is_default) values
  ('a4cccccc-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Matriz A', true);
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a4111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@rlsinva.mx');
update profiles set organization_id='a4000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='a4111111-0000-0000-0000-000000000001';

-- Org B: CON módulo 'inventario'; un admin y un viewer.
insert into organizations (id, slug, name) values
  ('a5000000-0000-0000-0000-000000000001','rlsinvB','RLS Inv B');
insert into organization_modules (organization_id, module_id, enabled)
select 'a5000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('inventario')
on conflict do nothing;
insert into warehouses (id, organization_id, name, is_default) values
  ('a5cccccc-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','Matriz B', true);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a5111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@rlsinvb.mx'),
  ('00000000-0000-0000-0000-000000000000','a5222222-0000-0000-0000-000000000001','authenticated','authenticated','viewer@rlsinvb.mx');
update profiles set organization_id='a5000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='a5111111-0000-0000-0000-000000000001';
update profiles set organization_id='a5000000-0000-0000-0000-000000000001', role='tenant_viewer'
 where id='a5222222-0000-0000-0000-000000000001';

-- Conteo borrador en org B (insertado como postgres) para probar el viewer.
insert into inventory_counts (id, organization_id, folio, warehouse_id, status) values
  ('a5aaaaaa-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','CONT-B-0000','a5cccccc-0000-0000-0000-000000000001','borrador');

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (1) Tenant SIN módulo inventario ⇒ NO puede insertar conteo =====
select _login('a4111111-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into inventory_counts (organization_id, folio, warehouse_id)
     values ('a4000000-0000-0000-0000-000000000001','CONT-A-0001','a4cccccc-0000-0000-0000-000000000001') $$,
  '42501', NULL,
  'Tenant sin módulo inventario NO puede insertar en inventory_counts (RLS)'
);

-- ============ (2) tenant_viewer ⇒ NO puede aplicar_conteo ====================
select _login('a5222222-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.aplicar_conteo('a5aaaaaa-0000-0000-0000-000000000001') $$,
  '42501', NULL,
  'tenant_viewer NO puede aplicar_conteo (falta permiso inventario/editar)'
);

-- ============ (3) tenant_admin CON módulo ⇒ SÍ puede insertar conteo ==========
select _login('a5111111-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into inventory_counts (organization_id, folio, warehouse_id)
     values ('a5000000-0000-0000-0000-000000000001','CONT-B-0001','a5cccccc-0000-0000-0000-000000000001') $$,
  'tenant_admin con módulo inventario SÍ puede insertar en inventory_counts'
);

select finish();
rollback;
