-- ============================================================================
-- pgTAP — F1 · Facturación: pagos / CxC (0012 · C1.5)
-- registrar_pago_factura parcial ⇒ 'pago_parcial'; pago que salda ⇒ 'pagada'.
-- (Factura global / remisiones eliminadas en 0013.)
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(4);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
insert into organizations (id, slug, name) values
  ('f3000000-0000-0000-0000-000000000001','factorg','Factura Org');

insert into organization_modules (organization_id, module_id, enabled)
select 'f3000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('facturacion')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','f3111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@fact.mx');
update profiles set organization_id='f3000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='f3111111-0000-0000-0000-000000000001';

-- Factura timbrada por 1000, PUE.
insert into invoices (id, organization_id, serie, folio, total, status, metodo_pago) values
  ('f3aaaaaa-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','A','1',1000,'timbrada','PUE');

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

select finish();
rollback;
