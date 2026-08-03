-- ============================================================================
-- pgTAP — F6 · RLS / RBAC de Órdenes de Entrada (módulo 'inventario', 0021)
--   · Un tenant SIN el módulo 'inventario' NO puede insertar en entry_orders (42501).
--   · Un tenant_viewer (sin permiso 'editar') NO puede aplicar_entrada (42501).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(2);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org A: SIN módulo 'inventario' (pero con almacén, insertado como postgres).
insert into organizations (id, slug, name) values
  ('b4000000-0000-0000-0000-000000000001','f6rlsA','F6 RLS Entradas A');
insert into warehouses (id, organization_id, name, is_default) values
  ('b4cccccc-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Matriz A', true);
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','b4111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@f6rlsa.mx');
update profiles set organization_id='b4000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='b4111111-0000-0000-0000-000000000001';

-- Org B: CON módulo 'inventario'; un admin y un viewer; una OE en borrador.
insert into organizations (id, slug, name) values
  ('b5000000-0000-0000-0000-000000000001','f6rlsB','F6 RLS Entradas B');
insert into organization_modules (organization_id, module_id, enabled)
select 'b5000000-0000-0000-0000-000000000001', id, true
  from modules where key = 'inventario'
on conflict do nothing;
insert into warehouses (id, organization_id, name, is_default) values
  ('b5cccccc-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001','Matriz B', true);
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','b5111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@f6rlsb.mx'),
  ('00000000-0000-0000-0000-000000000000','b5222222-0000-0000-0000-000000000001','authenticated','authenticated','viewer@f6rlsb.mx');
update profiles set organization_id='b5000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='b5111111-0000-0000-0000-000000000001';
update profiles set organization_id='b5000000-0000-0000-0000-000000000001', role='tenant_viewer'
 where id='b5222222-0000-0000-0000-000000000001';

insert into entry_orders (id, organization_id, folio, warehouse_id, origin, status) values
  ('b5aaaaaa-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001','OE-B-0000',
   'b5cccccc-0000-0000-0000-000000000001','manual','borrador');

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (1) Tenant SIN módulo inventario ⇒ NO inserta entry_orders =====
select _login('b4111111-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into entry_orders (organization_id, folio, warehouse_id, origin)
     values ('b4000000-0000-0000-0000-000000000001','OE-A-0001',
             'b4cccccc-0000-0000-0000-000000000001','manual') $$,
  '42501', NULL,
  'Tenant sin módulo inventario NO puede insertar en entry_orders (RLS)'
);

-- ============ (2) tenant_viewer ⇒ NO puede aplicar_entrada ==================
select _login('b5222222-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.aplicar_entrada('b5aaaaaa-0000-0000-0000-000000000001') $$,
  '42501', NULL,
  'tenant_viewer NO puede aplicar_entrada (falta permiso inventario/editar)'
);

select finish();
rollback;
