-- ============================================================================
-- pgTAP — F2 · Conteos físicos (0014 · C1.3)
--   · Stock 50, conteo con counted_qty=48 ⇒ aplicar_conteo genera 1 ajuste de -2,
--     deja stock 48 y status 'aplicado'.
--   · Conteo sin diferencias (counted_qty = system_qty) ⇒ 0 movimientos.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(6);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
insert into organizations (id, slug, name) values
  ('a2000000-0000-0000-0000-000000000001','conteoorg','Conteo Org');

insert into organization_modules (organization_id, module_id, enabled)
select 'a2000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('inventario')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a2111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@conteo.mx');
update profiles set organization_id='a2000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='a2111111-0000-0000-0000-000000000001';

insert into warehouses (id, organization_id, name, is_default) values
  ('a2cccccc-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Matriz', true);
insert into products (id, organization_id, name) values
  ('a2dddddd-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Producto K');
insert into product_variants (id, organization_id, product_id, sku, name, base_price_mxn) values
  ('a2eeeeee-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a2dddddd-0000-0000-0000-000000000001','SKU-K','Producto K',80);
insert into inventory (organization_id, product_variant_id, warehouse_id, stock, avg_cost) values
  ('a2000000-0000-0000-0000-000000000001','a2eeeeee-0000-0000-0000-000000000001','a2cccccc-0000-0000-0000-000000000001',50,100);

-- Conteo 1 (con diferencia): 50 sistema, 48 contado ⇒ ajuste -2.
insert into inventory_counts (id, organization_id, folio, warehouse_id, status) values
  ('a2aaaaaa-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','CONT-TEST-1','a2cccccc-0000-0000-0000-000000000001','borrador');
insert into inventory_count_items (organization_id, count_id, product_variant_id, system_qty, counted_qty) values
  ('a2000000-0000-0000-0000-000000000001','a2aaaaaa-0000-0000-0000-000000000001','a2eeeeee-0000-0000-0000-000000000001',50,48);

-- Conteo 2 (sin diferencia): 48 sistema, 48 contado ⇒ 0 ajustes.
insert into inventory_counts (id, organization_id, folio, warehouse_id, status) values
  ('a2aaaaaa-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','CONT-TEST-2','a2cccccc-0000-0000-0000-000000000001','borrador');
insert into inventory_count_items (organization_id, count_id, product_variant_id, system_qty, counted_qty) values
  ('a2000000-0000-0000-0000-000000000001','a2aaaaaa-0000-0000-0000-000000000002','a2eeeeee-0000-0000-0000-000000000001',48,48);

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('a2111111-0000-0000-0000-000000000001');

-- ============ (1) aplicar_conteo del conteo 1 ⇒ status 'aplicado' ============
select is(
  (public.aplicar_conteo('a2aaaaaa-0000-0000-0000-000000000001')).status::text,
  'aplicado',
  'aplicar_conteo deja el conteo con diferencias en aplicado'
);

-- ============ (2) El stock quedó en 48 ======================================
select is(
  (select stock from inventory
    where product_variant_id='a2eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='a2cccccc-0000-0000-0000-000000000001'),
  48,
  'El conteo ajustó el stock a 48'
);

-- ============ (3) Se generó exactamente 1 ajuste por el conteo 1 =============
select is(
  (select count(*)::int from inventory_movements
    where ref_type='count' and ref_id='a2aaaaaa-0000-0000-0000-000000000001' and type='ajuste'),
  1,
  'El conteo con 1 diferencia genera exactamente 1 ajuste'
);

-- ============ (4) El ajuste fue de -2 =======================================
select is(
  (select qty from inventory_movements
    where ref_type='count' and ref_id='a2aaaaaa-0000-0000-0000-000000000001' and type='ajuste'),
  -2,
  'El ajuste del conteo es de -2 (48 - 50)'
);

-- ============ (5) aplicar_conteo del conteo 2 (sin diferencia) no falla ======
select lives_ok(
  $$ select public.aplicar_conteo('a2aaaaaa-0000-0000-0000-000000000002') $$,
  'aplicar_conteo sin diferencias se aplica sin error'
);

-- ============ (6) El conteo sin diferencias no generó movimientos ============
select is(
  (select count(*)::int from inventory_movements
    where ref_type='count' and ref_id='a2aaaaaa-0000-0000-0000-000000000002'),
  0,
  'Un conteo sin diferencias no genera ningún movimiento'
);

select finish();
rollback;
