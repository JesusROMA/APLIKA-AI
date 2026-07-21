-- ============================================================================
-- pgTAP — F1 · RLS por módulo (0012 · C1.7)
-- Un tenant SIN el módulo 'facturacion' activo no puede insertar en
-- invoices/invoice_items (RLS 42501), pero SÍ en quotes porque tiene
-- 'cotizaciones'.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(3);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org con 'cotizaciones' activo pero SIN 'facturacion'.
insert into organizations (id, slug, name) values
  ('f4000000-0000-0000-0000-000000000001','rlsorg','RLS Org');
insert into organization_modules (organization_id, module_id, enabled)
select 'f4000000-0000-0000-0000-000000000001', id, true
  from modules where key in ('cotizaciones')
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','f4111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@rls.mx');
update profiles set organization_id='f4000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='f4111111-0000-0000-0000-000000000001';

-- Factura preexistente (insertada como postgres para tener un FK válido en la
-- prueba de invoice_items; la org NO tiene el módulo facturacion activo).
insert into invoices (id, organization_id, serie, folio, total, status) values
  ('f4aaaaaa-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000001','A','1',100,'timbrada');

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('f4111111-0000-0000-0000-000000000001');

-- ============ (1) Sin módulo facturacion ⇒ NO puede insertar invoices ========
select throws_ok(
  $$ insert into invoices (organization_id, folio, total)
     values ('f4000000-0000-0000-0000-000000000001','rls-test',100) $$,
  '42501', NULL,
  'Tenant sin módulo facturacion NO puede insertar en invoices (RLS)'
);

-- ============ (2) Sin módulo facturacion ⇒ NO puede insertar invoice_items ===
select throws_ok(
  $$ insert into invoice_items (organization_id, invoice_id, name, qty, unit_price, line_total)
     values ('f4000000-0000-0000-0000-000000000001','f4aaaaaa-0000-0000-0000-000000000001','X',1,100,100) $$,
  '42501', NULL,
  'Tenant sin módulo facturacion NO puede insertar en invoice_items (RLS)'
);

-- ============ (3) CON módulo cotizaciones ⇒ SÍ puede insertar quotes =========
select lives_ok(
  $$ insert into quotes (organization_id, folio, total)
     values ('f4000000-0000-0000-0000-000000000001','COT-RLS-0001',0) $$,
  'Tenant con módulo cotizaciones SÍ puede insertar en quotes'
);

select finish();
rollback;
