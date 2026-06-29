-- ============================================================================
-- pgTAP — RLS multi-tenant + decremento de inventario + backorder
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(7);

-- Extensión de pruebas
create extension if not exists pgtap;

-- --- Datos de prueba: 2 orgs, 2 usuarios, 1 producto en org A ----------------
insert into plans (id, key, name) values ('00000000-0000-0000-0000-0000000000p1','t','Test') on conflict do nothing;
insert into organizations (id, slug, name, allow_backorder) values
  ('aaaaaaaa-0000-0000-0000-000000000001','orga','Org A', false),
  ('bbbbbbbb-0000-0000-0000-000000000002','orgb','Org B', false);

insert into auth.users (instance_id, id, aud, role, email)
values
  ('00000000-0000-0000-0000-000000000000','11111111-aaaa-0000-0000-000000000001','authenticated','authenticated','a@test.mx'),
  ('00000000-0000-0000-0000-000000000000','22222222-bbbb-0000-0000-000000000002','authenticated','authenticated','b@test.mx');

update profiles set organization_id='aaaaaaaa-0000-0000-0000-000000000001', role='tenant_admin' where id='11111111-aaaa-0000-0000-000000000001';
update profiles set organization_id='bbbbbbbb-0000-0000-0000-000000000002', role='tenant_admin' where id='22222222-bbbb-0000-0000-000000000002';

insert into warehouses (id, organization_id, name, is_default) values
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Matriz', true);
insert into products (id, organization_id, name) values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Balata X');
insert into product_variants (id, organization_id, product_id, sku, name, base_price_mxn) values
  ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','SKU-X','Balata X',100);
insert into inventory (organization_id, product_variant_id, warehouse_id, stock, min_stock) values
  ('aaaaaaaa-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',10,5);

-- --- Helper para simular usuario autenticado ---------------------------------
create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============================ RLS: aislamiento ==============================
select _login('11111111-aaaa-0000-0000-000000000001');
select is(
  (select count(*)::int from product_variants),
  1,
  'Usuario A ve su propio producto'
);

select _login('22222222-bbbb-0000-0000-000000000002');
select is(
  (select count(*)::int from product_variants),
  0,
  'Usuario B NO ve productos de A (aislamiento por tenant)'
);

-- Usuario B no puede insertar en la org de A
select _login('22222222-bbbb-0000-0000-000000000002');
select throws_ok(
  $$ insert into products (organization_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001','Pirata') $$,
  null,
  'Usuario B no puede escribir en la org de A'
);

-- ===================== Decremento de inventario =============================
reset role;
select _login('11111111-aaaa-0000-0000-000000000001');

select lives_ok(
  $$ select adjust_inventory('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',-4,'salida','venta','order',null) $$,
  'adjust_inventory decrementa 4'
);
select is(
  (select stock from inventory where product_variant_id='eeeeeeee-0000-0000-0000-000000000001'),
  6,
  'Stock pasó de 10 a 6'
);
select is(
  (select count(*)::int from inventory_movements where product_variant_id='eeeeeeee-0000-0000-0000-000000000001'),
  1,
  'Se registró 1 movimiento en kardex'
);

-- ===================== Backorder bloqueado ==================================
select throws_ok(
  $$ select adjust_inventory('eeeeeeee-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',-100,'salida','venta','order',null) $$,
  'P0001',
  'Bloquea salida sin stock cuando allow_backorder = false'
);

select finish();
rollback;
