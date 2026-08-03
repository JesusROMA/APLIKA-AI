-- ============================================================================
-- pgTAP — F6 · Requisiciones · aprobar + RLS de módulo 'compras' (0021)
--   · aprobar_requisicion: 'borrador' → 'aprobada'; segundo intento falla.
--   · Un tenant SIN el módulo 'compras' NO puede insertar en requisitions (42501).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(3);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org A: CON módulo 'compras' (para aprobar).
insert into organizations (id, slug, name) values
  ('b2000000-0000-0000-0000-000000000001','f6reqA','F6 Req A');
insert into organization_modules (organization_id, module_id, enabled)
select 'b2000000-0000-0000-0000-000000000001', id, true
  from modules where key = 'compras'
on conflict do nothing;
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','b2111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@f6reqa.mx');
update profiles set organization_id='b2000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='b2111111-0000-0000-0000-000000000001';

-- Requisición en borrador.
insert into requisitions (id, organization_id, folio, status) values
  ('b2aaaaaa-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','REQ-A-0001','borrador');

-- Org B: SIN módulo 'compras'.
insert into organizations (id, slug, name) values
  ('b3000000-0000-0000-0000-000000000001','f6reqB','F6 Req B');
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','b3111111-0000-0000-0000-000000000001','authenticated','authenticated','admin@f6reqb.mx');
update profiles set organization_id='b3000000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='b3111111-0000-0000-0000-000000000001';

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (1) aprobar_requisicion: borrador → aprobada ==================
select _login('b2111111-0000-0000-0000-000000000001');
select is(
  (public.aprobar_requisicion('b2aaaaaa-0000-0000-0000-000000000001')).status::text,
  'aprobada',
  'aprobar_requisicion lleva la requisición de borrador a aprobada'
);

-- ============ (2) segundo aprobar ⇒ falla (no borrador) =====================
select throws_ok(
  $$ select public.aprobar_requisicion('b2aaaaaa-0000-0000-0000-000000000001') $$,
  NULL, NULL,
  'aprobar_requisicion dos veces falla (ya no está en borrador)'
);

-- ============ (3) tenant SIN módulo compras ⇒ NO inserta requisitions =======
select _login('b3111111-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into requisitions (organization_id, folio)
     values ('b3000000-0000-0000-0000-000000000001','REQ-B-0001') $$,
  '42501', NULL,
  'Tenant sin módulo compras NO puede insertar en requisitions (RLS)'
);

select finish();
rollback;
