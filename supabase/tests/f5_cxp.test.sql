-- ============================================================================
-- pgTAP — F5 · Cuentas por pagar: pagos a factura de proveedor (0019 · C1.3)
--   · Factura de proveedor total 1000, saldo 1000, 'registrada'; el endpoint ya
--     subió suppliers.balance a 1000 (se simula en el setup).
--   · registrar_pago_compra(400) ⇒ saldo 600, status 'pago_parcial',
--     suppliers.balance = 600.
--   · registrar_pago_compra(600) ⇒ saldo 0, status 'pagada',
--     suppliers.balance = 0.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(6);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
insert into organizations (id, slug, name) values
  ('a7000000-0000-0000-0000-000000000001','comprascxp','Compras CxP Org');

insert into organization_modules (organization_id, module_id, enabled)
select 'a7000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('compras')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','a7111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@comprascxp.mx');
update profiles set organization_id='a7000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='a7111111-0000-0000-0000-000000000001';

-- Proveedor con balance = 1000 (como lo dejó el endpoint al registrar la factura).
insert into suppliers (id, organization_id, name, balance) values
  ('a7ffffff-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001','Proveedor CxP',1000);

-- Factura de proveedor: total 1000, saldo 1000, registrada.
insert into supplier_invoices (id, organization_id, supplier_id, folio, total, saldo, status) values
  ('a7aaaaaa-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000001',
   'a7ffffff-0000-0000-0000-000000000001','F-PROV-001',1000,1000,'registrada');

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('a7111111-0000-0000-0000-000000000001');

-- ============ (1) pago 400 ⇒ status 'pago_parcial' =========================
select is(
  (public.registrar_pago_compra('a7aaaaaa-0000-0000-0000-000000000001',400,'03')).status::text,
  'pago_parcial',
  'pago de 400 deja la factura en pago_parcial'
);

-- ============ (2) saldo = 600 ===============================================
select is(
  (select saldo from supplier_invoices where id='a7aaaaaa-0000-0000-0000-000000000001'),
  600::numeric(14,2),
  'saldo de la factura = 600 (1000 - 400)'
);

-- ============ (3) suppliers.balance = 600 ===================================
select is(
  (select balance from suppliers where id='a7ffffff-0000-0000-0000-000000000001'),
  600::numeric(14,2),
  'el pago bajó suppliers.balance a 600'
);

-- ============ (4) pago 600 ⇒ status 'pagada' ================================
select is(
  (public.registrar_pago_compra('a7aaaaaa-0000-0000-0000-000000000001',600,'03')).status::text,
  'pagada',
  'pago de 600 salda la factura ⇒ pagada'
);

-- ============ (5) saldo = 0 =================================================
select is(
  (select saldo from supplier_invoices where id='a7aaaaaa-0000-0000-0000-000000000001'),
  0::numeric(14,2),
  'saldo de la factura = 0'
);

-- ============ (6) suppliers.balance = 0 =====================================
select is(
  (select balance from suppliers where id='a7ffffff-0000-0000-0000-000000000001'),
  0::numeric(14,2),
  'suppliers.balance quedó en 0 tras liquidar'
);

select finish();
rollback;
