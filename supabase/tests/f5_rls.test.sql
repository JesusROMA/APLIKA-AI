-- ============================================================================
-- pgTAP — F5 · RLS / RBAC de compras (0019 · C1.4)
--   · Un tenant SIN el módulo 'compras' NO puede insertar en purchase_orders
--     ni en suppliers (RLS ⇒ 42501).
--   · Un tenant_viewer (sin permiso 'editar') NO puede recibir_compra (42501).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(3);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org A: SIN módulo 'compras'.
insert into organizations (id, slug, name) values
  ('a8000000-0000-0000-0000-000000000001','rlscomprasA','RLS Compras A');
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a8111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@rlscomprasa.mx');
update profiles set organization_id='a8000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='a8111111-0000-0000-0000-000000000001';

-- Org B: CON módulo 'compras'; un admin y un viewer.
insert into organizations (id, slug, name) values
  ('a9000000-0000-0000-0000-000000000001','rlscomprasB','RLS Compras B');
insert into organization_modules (organization_id, module_id, enabled)
select 'a9000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('compras','inventario')
on conflict do nothing;
insert into warehouses (id, organization_id, name, is_default) values
  ('a9cccccc-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001','Matriz B', true);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a9111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@rlscomprasb.mx'),
  ('00000000-0000-0000-0000-000000000000','a9222222-0000-0000-0000-000000000001','authenticated','authenticated','viewer@rlscomprasb.mx');
update profiles set organization_id='a9000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='a9111111-0000-0000-0000-000000000001';
update profiles set organization_id='a9000000-0000-0000-0000-000000000001', role='tenant_viewer'
 where id='a9222222-0000-0000-0000-000000000001';

-- OC confirmada en org B (insertada como postgres) para probar al viewer.
insert into suppliers (id, organization_id, name) values
  ('a9ffffff-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001','Proveedor B');
insert into purchase_orders (id, organization_id, folio, supplier_id, warehouse_id, status) values
  ('a9aaaaaa-0000-0000-0000-000000000001','a9000000-0000-0000-0000-000000000001','OC-B-0000',
   'a9ffffff-0000-0000-0000-000000000001','a9cccccc-0000-0000-0000-000000000001','confirmada');

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (1) Tenant SIN módulo compras ⇒ NO puede insertar suppliers ====
select _login('a8111111-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into suppliers (organization_id, name)
     values ('a8000000-0000-0000-0000-000000000001','Proveedor X') $$,
  '42501', NULL,
  'Tenant sin módulo compras NO puede insertar en suppliers (RLS)'
);

-- ============ (2) Tenant SIN módulo compras ⇒ NO puede insertar OC ===========
select throws_ok(
  $$ insert into purchase_orders (organization_id, folio, supplier_id)
     values ('a8000000-0000-0000-0000-000000000001','OC-A-0001','a9ffffff-0000-0000-0000-000000000001') $$,
  '42501', NULL,
  'Tenant sin módulo compras NO puede insertar en purchase_orders (RLS)'
);

-- ============ (3) tenant_viewer ⇒ NO puede recibir_compra ===================
select _login('a9222222-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.recibir_compra('a9aaaaaa-0000-0000-0000-000000000001',
       '[{"item_id":"a9aaaaaa-0000-0000-0000-000000000001","qty":1}]'::jsonb) $$,
  '42501', NULL,
  'tenant_viewer NO puede recibir_compra (falta permiso compras/editar)'
);

select finish();
rollback;
