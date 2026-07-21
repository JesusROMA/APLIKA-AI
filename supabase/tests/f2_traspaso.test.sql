-- ============================================================================
-- pgTAP — F2 · Traspasos entre almacenes (0014 · C1.4)
--   · Origen stock 30 (avg 100), destino 0.
--   · enviar_traspaso de 10 ⇒ origen 20, status 'en_transito', el item captura
--     el costo del origen (unit_cost = 100).
--   · recibir_traspaso ⇒ destino 10 con avg 100, status 'recibido'.
--   · El stock total (origen + destino) se conserva (20 + 10 = 30).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(7);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
insert into organizations (id, slug, name) values
  ('a3000000-0000-0000-0000-000000000001','traspasoorg','Traspaso Org');

insert into organization_modules (organization_id, module_id, enabled)
select 'a3000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('inventario')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a3111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@traspaso.mx');
update profiles set organization_id='a3000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='a3111111-0000-0000-0000-000000000001';

-- Almacén origen (A) y destino (B).
insert into warehouses (id, organization_id, name, is_default) values
  ('a3cccccc-0000-0000-0000-00000000000a','a3000000-0000-0000-0000-000000000001','Origen', true),
  ('a3cccccc-0000-0000-0000-00000000000b','a3000000-0000-0000-0000-000000000001','Destino', false);
insert into products (id, organization_id, name) values
  ('a3dddddd-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','Producto T');
insert into product_variants (id, organization_id, product_id, sku, name, base_price_mxn) values
  ('a3eeeeee-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a3dddddd-0000-0000-0000-000000000001','SKU-T','Producto T',250);

-- Inventario del origen: 30 @ avg 100. El destino no tiene fila (se crea al recibir).
insert into inventory (organization_id, product_variant_id, warehouse_id, stock, avg_cost) values
  ('a3000000-0000-0000-0000-000000000001','a3eeeeee-0000-0000-0000-000000000001','a3cccccc-0000-0000-0000-00000000000a',30,100);

-- Traspaso borrador de 10 unidades del origen al destino.
insert into inventory_transfers (id, organization_id, folio, from_warehouse_id, to_warehouse_id, status) values
  ('a3aaaaaa-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','TRAS-TEST-1',
   'a3cccccc-0000-0000-0000-00000000000a','a3cccccc-0000-0000-0000-00000000000b','borrador');
insert into inventory_transfer_items (organization_id, transfer_id, product_variant_id, qty) values
  ('a3000000-0000-0000-0000-000000000001','a3aaaaaa-0000-0000-0000-000000000001','a3eeeeee-0000-0000-0000-000000000001',10);

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('a3111111-0000-0000-0000-000000000001');

-- ============ (1) enviar_traspaso ⇒ status 'en_transito' ====================
select is(
  (public.enviar_traspaso('a3aaaaaa-0000-0000-0000-000000000001')).status::text,
  'en_transito',
  'enviar_traspaso deja el traspaso en en_transito'
);

-- ============ (2) El origen bajó a 20 =======================================
select is(
  (select stock from inventory
    where product_variant_id='a3eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='a3cccccc-0000-0000-0000-00000000000a'),
  20,
  'enviar_traspaso descontó 10 del origen (30 - 10 = 20)'
);

-- ============ (3) El item capturó el costo del origen (unit_cost = 100) ======
select is(
  (select unit_cost from inventory_transfer_items
    where transfer_id='a3aaaaaa-0000-0000-0000-000000000001'),
  100::numeric(14,4),
  'El item del traspaso guarda el costo del origen que viaja (100)'
);

-- ============ (4) recibir_traspaso ⇒ status 'recibido' ======================
select is(
  (public.recibir_traspaso('a3aaaaaa-0000-0000-0000-000000000001')).status::text,
  'recibido',
  'recibir_traspaso deja el traspaso en recibido'
);

-- ============ (5) El destino subió a 10 =====================================
select is(
  (select stock from inventory
    where product_variant_id='a3eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='a3cccccc-0000-0000-0000-00000000000b'),
  10,
  'recibir_traspaso sumó 10 al destino'
);

-- ============ (6) El destino tomó el costo que viajó (avg 100) ===============
select is(
  (select avg_cost from inventory
    where product_variant_id='a3eeeeee-0000-0000-0000-000000000001'
      and warehouse_id='a3cccccc-0000-0000-0000-00000000000b'),
  100::numeric(14,4),
  'El destino queda con avg_cost = 100 (el costo que viajó)'
);

-- ============ (7) El stock total se conserva (20 + 10 = 30) ==================
select is(
  (select stock from inventory where product_variant_id='a3eeeeee-0000-0000-0000-000000000001'
     and warehouse_id='a3cccccc-0000-0000-0000-00000000000a')
  + (select stock from inventory where product_variant_id='a3eeeeee-0000-0000-0000-000000000001'
     and warehouse_id='a3cccccc-0000-0000-0000-00000000000b'),
  30,
  'El stock total (origen + destino) se conserva en 30'
);

select finish();
rollback;
