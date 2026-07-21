-- ============================================================================
-- pgTAP — F1 · Facturación: pagos/CxC + candado de factura global (0012 · C1.5)
-- registrar_pago_factura parcial ⇒ 'pago_parcial', pago que salda ⇒ 'pagada';
-- invoice_sales_notes.unique(sales_note_id) impide facturar una remisión 2 veces.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(6);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
insert into organizations (id, slug, name) values
  ('f3000000-0000-0000-0000-000000000001','factorg','Factura Org');

insert into organization_modules (organization_id, module_id, enabled)
select 'f3000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('facturacion','remisiones')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','f3111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@fact.mx');
update profiles set organization_id='f3000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='f3111111-0000-0000-0000-000000000001';

-- Factura timbrada por 1000, PUE.
insert into invoices (id, organization_id, serie, folio, total, status, metodo_pago) values
  ('f3aaaaaa-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','A','1',1000,'timbrada','PUE');

-- Segunda factura + una remisión (para el candado global).
insert into invoices (id, organization_id, serie, folio, total, status) values
  ('f3aaaaaa-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000001','A','2',500,'timbrada');
insert into sales_notes (id, organization_id, folio, status, total) values
  ('f3bbbbbb-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','REM-GLOB','facturada',500);

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('f3111111-0000-0000-0000-000000000001');

-- ============ (1) Pago parcial de 400 ⇒ status 'pago_parcial' ================
select is(
  (public.registrar_pago_factura('f3aaaaaa-0000-0000-0000-000000000001',400,'03')).status::text,
  'pago_parcial',
  'Pago de 400 sobre 1000 deja la factura en pago_parcial'
);

-- ============ (2) Saldo tras el pago parcial = 600 ==========================
select is(
  (select saldo from invoices where id='f3aaaaaa-0000-0000-0000-000000000001'),
  600::numeric(14,2),
  'El saldo tras el pago parcial es 600'
);

-- ============ (3) Pago de 600 que salda ⇒ status 'pagada' ====================
select is(
  (public.registrar_pago_factura('f3aaaaaa-0000-0000-0000-000000000001',600,'03')).status::text,
  'pagada',
  'Pago de 600 que salda deja la factura en pagada'
);

-- ============ (4) Saldo final = 0 ===========================================
select is(
  (select saldo from invoices where id='f3aaaaaa-0000-0000-0000-000000000001'),
  0::numeric(14,2),
  'El saldo final es 0'
);

-- --- Candado de factura global (constraint unique, no RLS) -------------------
reset role;

-- ============ (5) Ligar la remisión a la 1ª factura: OK ======================
select lives_ok(
  $$ insert into invoice_sales_notes (organization_id, invoice_id, sales_note_id)
     values ('f3000000-0000-0000-0000-000000000001','f3aaaaaa-0000-0000-0000-000000000001','f3bbbbbb-0000-0000-0000-000000000001') $$,
  'Una remisión puede ligarse a una factura'
);

-- ============ (6) Ligarla a una 2ª factura viola unique(sales_note_id) =======
select throws_ok(
  $$ insert into invoice_sales_notes (organization_id, invoice_id, sales_note_id)
     values ('f3000000-0000-0000-0000-000000000001','f3aaaaaa-0000-0000-0000-000000000002','f3bbbbbb-0000-0000-0000-000000000001') $$,
  '23505', NULL,
  'La misma remisión NO puede ir en una 2ª factura (candado unique)'
);

select finish();
rollback;
