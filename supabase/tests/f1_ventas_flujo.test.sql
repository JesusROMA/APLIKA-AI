-- ============================================================================
-- pgTAP — F1 · Flujo de ventas (0012 · C1.2/C1.3/C1.4)
-- Cotización (insert RLS) · record_delivery parcial/total · cobrar_remision
-- aplica stock UNA sola vez.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(8);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
insert into organizations (id, slug, name, allow_backorder) values
  ('f2000000-0000-0000-0000-000000000001','ventasorg','Ventas Org', false);

-- Módulos activos para la org de prueba.
insert into organization_modules (organization_id, module_id, enabled)
select 'f2000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('ordenes','inventario','cotizaciones','remisiones')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','f2111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@ventas.mx');
update profiles set organization_id='f2000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='f2111111-0000-0000-0000-000000000001';

insert into warehouses (id, organization_id, name, is_default) values
  ('f2cccccc-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','Matriz', true);
insert into products (id, organization_id, name) values
  ('f2dddddd-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','Producto V');
insert into product_variants (id, organization_id, product_id, sku, name, base_price_mxn) values
  ('f2eeeeee-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f2dddddd-0000-0000-0000-000000000001','SKU-V','Producto V',100);
insert into inventory (organization_id, product_variant_id, warehouse_id, stock) values
  ('f2000000-0000-0000-0000-000000000001','f2eeeeee-0000-0000-0000-000000000001','f2cccccc-0000-0000-0000-000000000001',50);

-- Pedido en 'pagado' con 2 partidas (stock ya se considera aplicado por el
-- pipeline; record_delivery NO toca inventario).
insert into orders (id, organization_id, folio, status, stock_applied) values
  ('f2aaaaaa-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','PED-TEST','pagado', true);
insert into order_items (id, organization_id, order_id, product_variant_id, name, qty, unit_price, line_total) values
  ('f2000011-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f2aaaaaa-0000-0000-0000-000000000001','f2eeeeee-0000-0000-0000-000000000001','Línea 1',5,100,500),
  ('f2000011-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','f2aaaaaa-0000-0000-0000-000000000001','f2eeeeee-0000-0000-0000-000000000001','Línea 2',3,100,300);

-- Remisión abierta con 1 partida.
insert into sales_notes (id, organization_id, folio, warehouse_id, status, total) values
  ('f2bbbbbb-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','REM-TEST','f2cccccc-0000-0000-0000-000000000001','abierta',464);
insert into sales_note_items (id, organization_id, sales_note_id, product_variant_id, name, qty, unit_price, line_total) values
  ('f2000022-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f2bbbbbb-0000-0000-0000-000000000001','f2eeeeee-0000-0000-0000-000000000001','Remisión línea',4,100,400);

-- --- Helper de login ---------------------------------------------------------
create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('f2111111-0000-0000-0000-000000000001');

-- ============ (1) Insert de cotización pasa la RLS de 'cotizaciones' =========
select lives_ok(
  $$ insert into quotes (organization_id, folio, total)
     values ('f2000000-0000-0000-0000-000000000001', public.next_serie_folio('f2000000-0000-0000-0000-000000000001','quote'), 0) $$,
  'tenant_admin con módulo cotizaciones SÍ puede insertar una cotización'
);

-- ============ (2) Insert de partida de cotización ============================
select lives_ok(
  $$ insert into quote_items (organization_id, quote_id, name, qty, unit_price, line_total)
     select organization_id, id, 'Línea', 2, 100, 200 from quotes limit 1 $$,
  'tenant_admin SÍ puede insertar partidas de cotización'
);

-- ============ (3) record_delivery parcial ⇒ 'surtido_parcial' ================
select is(
  (public.record_delivery(
    'f2aaaaaa-0000-0000-0000-000000000001',
    '[{"item_id":"f2000011-0000-0000-0000-000000000001","qty":5},
      {"item_id":"f2000011-0000-0000-0000-000000000002","qty":1}]'::jsonb)).status::text,
  'surtido_parcial',
  'Entrega parcial (5/5 y 1/3) deja el pedido en surtido_parcial'
);

-- ============ (4) record_delivery completa ⇒ 'surtido' ======================
select is(
  (public.record_delivery(
    'f2aaaaaa-0000-0000-0000-000000000001',
    '[{"item_id":"f2000011-0000-0000-0000-000000000002","qty":2}]'::jsonb)).status::text,
  'surtido',
  'Completar la entrega (3/3) deja el pedido en surtido'
);

-- ============ (5) cobrar_remision ⇒ 'cobrada' ===============================
select is(
  (public.cobrar_remision('f2bbbbbb-0000-0000-0000-000000000001','efectivo')).status::text,
  'cobrada',
  'cobrar_remision deja la remisión en cobrada'
);

-- ============ (6) El stock se decrementó (50 - 4 = 46) ======================
select is(
  (select stock from inventory where product_variant_id='f2eeeeee-0000-0000-0000-000000000001'),
  46,
  'cobrar_remision decrementó el stock de 50 a 46'
);

-- ============ (7) Se registró EXACTAMENTE 1 movimiento de la remisión ========
select is(
  (select count(*)::int from inventory_movements
     where ref_type='sales_note' and ref_id='f2bbbbbb-0000-0000-0000-000000000001'),
  1,
  'La remisión generó exactamente 1 movimiento de kardex'
);

-- ============ (8) Segundo cobro falla (ya no está abierta) ⇒ no duplica ======
select throws_ok(
  $$ select public.cobrar_remision('f2bbbbbb-0000-0000-0000-000000000001','efectivo') $$,
  'P0001', NULL,
  'Cobrar una remisión ya cobrada falla (no duplica stock ni ingreso)'
);

select finish();
rollback;
