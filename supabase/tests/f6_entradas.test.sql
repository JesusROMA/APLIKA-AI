-- ============================================================================
-- pgTAP — F6 · Orden de Entrada = único camino de entrada de inventario (0021)
--   · OE 'manual' con 1 partida (variante, qty 10, unit_cost 50) sobre stock 0.
--     aplicar_entrada ⇒ status 'aplicada', stock +10, avg_cost = 50.
--   · Segundo aplicar_entrada ⇒ falla (no está en 'borrador').
--   · OE 'compra' ligada a una OC (purchase_order_id + purchase_order_item_id):
--     al aplicarse suma a qty_received y deja la OC 'recibida'.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(6);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
insert into organizations (id, slug, name, allow_backorder) values
  ('b1000000-0000-0000-0000-000000000001','f6entradas','F6 Entradas Org', false);

insert into organization_modules (organization_id, module_id, enabled)
select 'b1000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('compras','inventario')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','b1111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@f6entradas.mx');
update profiles set organization_id='b1000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='b1111111-0000-0000-0000-000000000001';

insert into warehouses (id, organization_id, name, is_default) values
  ('b1cccccc-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Matriz', true);
insert into products (id, organization_id, name) values
  ('b1dddddd-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Producto E');
insert into product_variants (id, organization_id, product_id, sku, name, base_price_mxn) values
  ('b1eeeeee-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b1dddddd-0000-0000-0000-000000000001','SKU-E1','Variante E1',300),
  ('b1eeeeee-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','b1dddddd-0000-0000-0000-000000000001','SKU-E2','Variante E2',300);

-- OE manual en borrador con 1 partida (variante E1, qty 10 @ 50).
insert into entry_orders (id, organization_id, folio, warehouse_id, origin, status) values
  ('b1aaaaaa-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','OE-TEST-1',
   'b1cccccc-0000-0000-0000-000000000001','manual','borrador');
insert into entry_order_items (id, organization_id, entry_order_id, product_variant_id, name, qty, unit_cost) values
  ('b1bbbbbb-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b1aaaaaa-0000-0000-0000-000000000001',
   'b1eeeeee-0000-0000-0000-000000000001','Línea E1',10,50);

-- OC confirmada + partida pendiente (variante E2, qty 10 @ 80) para la OE ligada.
insert into suppliers (id, organization_id, name) values
  ('b1ffffff-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Proveedor E');
insert into purchase_orders (id, organization_id, folio, supplier_id, warehouse_id, status, total) values
  ('b1a0aaaa-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','OC-E-1',
   'b1ffffff-0000-0000-0000-000000000001','b1cccccc-0000-0000-0000-000000000001','confirmada',928);
insert into purchase_order_items (id, organization_id, purchase_order_id, product_variant_id, name, qty, unit_cost, line_total) values
  ('b1b0bbbb-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b1a0aaaa-0000-0000-0000-000000000001',
   'b1eeeeee-0000-0000-0000-000000000002','Línea OC-E',10,80,800);

-- OE de compra ligada a la OC y a su partida.
insert into entry_orders (id, organization_id, folio, warehouse_id, origin, purchase_order_id, status) values
  ('b1aaaaaa-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','OE-TEST-2',
   'b1cccccc-0000-0000-0000-000000000001','compra','b1a0aaaa-0000-0000-0000-000000000001','borrador');
insert into entry_order_items (id, organization_id, entry_order_id, purchase_order_item_id, product_variant_id, name, qty, unit_cost) values
  ('b1bbbbbb-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','b1aaaaaa-0000-0000-0000-000000000002',
   'b1b0bbbb-0000-0000-0000-000000000001','b1eeeeee-0000-0000-0000-000000000002','Línea OE-OC',10,80);

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('b1111111-0000-0000-0000-000000000001');

-- ============ (1) aplicar_entrada manual ⇒ status 'aplicada' =================
select is(
  (public.aplicar_entrada('b1aaaaaa-0000-0000-0000-000000000001')).status::text,
  'aplicada',
  'aplicar_entrada deja la OE manual en aplicada'
);

-- ============ (2) stock del inventario = 10 =================================
select is(
  (select stock from inventory
    where product_variant_id='b1eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='b1cccccc-0000-0000-0000-000000000001'),
  10,
  'la entrada sumó 10 al stock (0 + 10)'
);

-- ============ (3) avg_cost del inventario = 50 (costo de la entrada) =========
select is(
  (select avg_cost from inventory
    where product_variant_id='b1eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='b1cccccc-0000-0000-0000-000000000001'),
  50::numeric(14,4),
  'la entrada entró al costo unitario ⇒ avg_cost = 50'
);

-- ============ (4) segundo aplicar_entrada ⇒ falla (no borrador) =============
select throws_ok(
  $$ select public.aplicar_entrada('b1aaaaaa-0000-0000-0000-000000000001') $$,
  NULL, NULL,
  'aplicar_entrada dos veces falla (la OE ya no está en borrador)'
);

-- ============ (5) OE ligada a OC ⇒ qty_received de la partida = 10 ==========
select public.aplicar_entrada('b1aaaaaa-0000-0000-0000-000000000002');
select is(
  (select qty_received from purchase_order_items where id='b1b0bbbb-0000-0000-0000-000000000001'),
  10::numeric(14,3),
  'aplicar la OE ligada suma a qty_received de la partida de OC'
);

-- ============ (6) la OC quedó 'recibida' (todas sus partidas completas) ======
select is(
  (select status from purchase_orders where id='b1a0aaaa-0000-0000-0000-000000000001')::text,
  'recibida',
  'la OC ligada quedó recibida al aplicarse la OE'
);

select finish();
rollback;
