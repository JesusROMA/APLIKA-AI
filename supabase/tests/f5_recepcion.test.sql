-- ============================================================================
-- pgTAP — F5 · Recepción de compra alimenta el costeo promedio (0019 · C1.2)
--   · OC 'confirmada' con 1 partida (qty 10, unit_cost 80) sobre stock 0.
--   · recibir_compra de 4 ⇒ status 'recibida_parcial', qty_received 4,
--     stock +4, avg_cost del inventario = 80.
--   · recibir_compra de los 6 restantes ⇒ status 'recibida', qty_received 10,
--     stock 10.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(7);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
insert into organizations (id, slug, name, allow_backorder) values
  ('a6000000-0000-0000-0000-000000000001','comprasrec','Compras Rec Org', false);

insert into organization_modules (organization_id, module_id, enabled)
select 'a6000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('compras','inventario')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a6111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@comprasrec.mx');
update profiles set organization_id='a6000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='a6111111-0000-0000-0000-000000000001';

insert into warehouses (id, organization_id, name, is_default) values
  ('a6cccccc-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','Matriz', true);
insert into products (id, organization_id, name) values
  ('a6dddddd-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','Producto Rec');
insert into product_variants (id, organization_id, product_id, sku, name, base_price_mxn) values
  ('a6eeeeee-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','a6dddddd-0000-0000-0000-000000000001','SKU-REC','Producto Rec',300);

-- Proveedor + OC confirmada con 1 partida (qty 10 @ 80).
insert into suppliers (id, organization_id, name) values
  ('a6ffffff-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','Proveedor Uno');
insert into purchase_orders (id, organization_id, folio, supplier_id, warehouse_id, status, total) values
  ('a6aaaaaa-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','OC-TEST-1',
   'a6ffffff-0000-0000-0000-000000000001','a6cccccc-0000-0000-0000-000000000001','confirmada',928);
insert into purchase_order_items (id, organization_id, purchase_order_id, product_variant_id, name, qty, unit_cost, line_total) values
  ('a6bbbbbb-0000-0000-0000-000000000001','a6000000-0000-0000-0000-000000000001','a6aaaaaa-0000-0000-0000-000000000001',
   'a6eeeeee-0000-0000-0000-000000000001','Línea Rec',10,80,800);

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('a6111111-0000-0000-0000-000000000001');

-- ============ (1) recibir 4 ⇒ status 'recibida_parcial' =====================
select is(
  (public.recibir_compra(
    'a6aaaaaa-0000-0000-0000-000000000001',
    '[{"item_id":"a6bbbbbb-0000-0000-0000-000000000001","qty":4}]'::jsonb)).status::text,
  'recibida_parcial',
  'recibir 4 de 10 deja la OC en recibida_parcial'
);

-- ============ (2) qty_received = 4 ==========================================
select is(
  (select qty_received from purchase_order_items where id='a6bbbbbb-0000-0000-0000-000000000001'),
  4::numeric(14,3),
  'qty_received de la partida = 4'
);

-- ============ (3) stock del inventario = 4 ==================================
select is(
  (select stock from inventory
    where product_variant_id='a6eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='a6cccccc-0000-0000-0000-000000000001'),
  4,
  'la recepción sumó 4 al stock (0 + 4)'
);

-- ============ (4) avg_cost del inventario = 80 (costo de la OC) =============
select is(
  (select avg_cost from inventory
    where product_variant_id='a6eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='a6cccccc-0000-0000-0000-000000000001'),
  80::numeric(14,4),
  'la recepción entró al costo de la OC ⇒ avg_cost = 80'
);

-- ============ (5) recibir los 6 restantes ⇒ status 'recibida' ===============
select is(
  (public.recibir_compra(
    'a6aaaaaa-0000-0000-0000-000000000001',
    '[{"item_id":"a6bbbbbb-0000-0000-0000-000000000001","qty":6}]'::jsonb)).status::text,
  'recibida',
  'recibir los 6 restantes completa la OC ⇒ recibida'
);

-- ============ (6) qty_received = 10 =========================================
select is(
  (select qty_received from purchase_order_items where id='a6bbbbbb-0000-0000-0000-000000000001'),
  10::numeric(14,3),
  'qty_received de la partida = 10 (completa)'
);

-- ============ (7) stock del inventario = 10 =================================
select is(
  (select stock from inventory
    where product_variant_id='a6eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='a6cccccc-0000-0000-0000-000000000001'),
  10,
  'el stock quedó en 10 tras recibir el total'
);

select finish();
rollback;
