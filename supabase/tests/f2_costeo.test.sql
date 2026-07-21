-- ============================================================================
-- pgTAP — F2 · Costeo promedio ponderado + snapshots de kardex (0014 · C1.1/C1.2)
--   · Entrada 10@100 sobre stock 0 ⇒ avg=100.
--   · Entrada 10@200 ⇒ avg=150 (promedio ponderado).
--   · Salida 5 ⇒ avg sigue 150; el movimiento sale al promedio (unit_cost=150),
--     con balance_after/avg_cost_after correctos.
--   · apply_order_stock (transition_order → 'pagado') sigue vivo con la firma
--     vieja de 7 args y su salida sale al costo promedio (COGS = avg_cost).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(9);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
insert into organizations (id, slug, name, allow_backorder) values
  ('a1000000-0000-0000-0000-000000000001','costeoorg','Costeo Org', false);

insert into organization_modules (organization_id, module_id, enabled)
select 'a1000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('inventario','ordenes')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a1111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@costeo.mx');
update profiles set organization_id='a1000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='a1111111-0000-0000-0000-000000000001';

insert into warehouses (id, organization_id, name, is_default) values
  ('a1cccccc-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Matriz', true);
insert into products (id, organization_id, name) values
  ('a1dddddd-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Producto C');
insert into product_variants (id, organization_id, product_id, sku, name, base_price_mxn) values
  ('a1eeeeee-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1dddddd-0000-0000-0000-000000000001','SKU-C','Producto C',300);

-- Pedido 'confirmado' con 1 partida (variante real) para probar apply_order_stock.
insert into orders (id, organization_id, folio, status, stock_applied, warehouse_id) values
  ('a1aaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','PED-COST','confirmado', false,'a1cccccc-0000-0000-0000-000000000001');
insert into order_items (id, organization_id, order_id, product_variant_id, name, qty, unit_price, line_total) values
  ('a1bbbbbb-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1aaaaaa-0000-0000-0000-000000000001','a1eeeeee-0000-0000-0000-000000000001','Línea',3,300,900);

-- --- Helper de login ---------------------------------------------------------
create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('a1111111-0000-0000-0000-000000000001');

-- ============ (1) Entrada 10@100 sobre stock 0 ⇒ avg = 100 ===================
select is(
  (public.adjust_inventory(
    'a1eeeeee-0000-0000-0000-000000000001','a1cccccc-0000-0000-0000-000000000001',
    10,'entrada','Compra 1','manual',null,100)).avg_cost,
  100::numeric(14,4),
  'Entrada 10@100 sobre stock 0 deja avg_cost = 100'
);

-- ============ (2) Entrada 10@200 ⇒ avg = 150 (promedio ponderado) ============
select is(
  (public.adjust_inventory(
    'a1eeeeee-0000-0000-0000-000000000001','a1cccccc-0000-0000-0000-000000000001',
    10,'entrada','Compra 2','manual',null,200)).avg_cost,
  150::numeric(14,4),
  'Entrada 10@200 sobre 10@100 deja avg_cost = 150 (ponderado)'
);

-- ============ (3) Salida 5 ⇒ avg NO cambia (sigue 150) =======================
select is(
  (public.adjust_inventory(
    'a1eeeeee-0000-0000-0000-000000000001','a1cccccc-0000-0000-0000-000000000001',
    -5,'salida','Venta manual','manual',null)).avg_cost,
  150::numeric(14,4),
  'Salida de 5 no cambia el costo promedio (sigue 150)'
);

-- ============ (4) El movimiento de salida sale al promedio (unit_cost=150) ===
select is(
  (select unit_cost from inventory_movements
    where product_variant_id='a1eeeeee-0000-0000-0000-000000000001'
      and type='salida' and ref_type='manual' order by created_at desc limit 1),
  150::numeric(14,4),
  'La salida manual registra unit_cost = 150 (COGS al promedio)'
);

-- ============ (5) balance_after de la salida = 15 ===========================
select is(
  (select balance_after from inventory_movements
    where product_variant_id='a1eeeeee-0000-0000-0000-000000000001'
      and type='salida' and ref_type='manual' order by created_at desc limit 1),
  15,
  'balance_after de la salida = 15 (20 - 5)'
);

-- ============ (6) avg_cost_after de la salida = 150 =========================
select is(
  (select avg_cost_after from inventory_movements
    where product_variant_id='a1eeeeee-0000-0000-0000-000000000001'
      and type='salida' and ref_type='manual' order by created_at desc limit 1),
  150::numeric(14,4),
  'avg_cost_after de la salida = 150'
);

-- ============ (7) transition_order → 'pagado' aplica stock (apply_order_stock)
select is(
  (public.transition_order('a1aaaaaa-0000-0000-0000-000000000001','pagado')).status::text,
  'pagado',
  'transition_order a pagado ejecuta apply_order_stock (firma vieja de 7 args)'
);

-- ============ (8) El stock bajó de 15 a 12 por el pedido (qty 3) =============
select is(
  (select stock from inventory
    where product_variant_id='a1eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='a1cccccc-0000-0000-0000-000000000001'),
  12,
  'apply_order_stock decrementó el inventario (15 - 3 = 12)'
);

-- ============ (9) La salida del pedido salió al costo promedio (COGS=150) ====
select is(
  (select unit_cost from inventory_movements
    where product_variant_id='a1eeeeee-0000-0000-0000-000000000001'
      and type='salida' and ref_type='order' order by created_at desc limit 1),
  150::numeric(14,4),
  'La salida del pedido registra unit_cost = avg_cost (COGS = 150)'
);

select finish();
rollback;
