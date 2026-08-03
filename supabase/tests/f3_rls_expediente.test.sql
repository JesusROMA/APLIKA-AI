-- ============================================================================
-- pgTAP — F3 · Gating por módulo 'expediente' (0016 · C1.3/C1.4)
-- Un tenant SIN el módulo 'expediente' activo:
--   · NO ve notas clínicas aunque exista una cuyo autor sea él (SELECT ⇒ 0).
--   · NO puede insertar notas (RLS with check ⇒ 42501).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(2);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org SIN vertical ⇒ sin auto-asignación de módulos; sólo 'calendario' manual
-- (tenant funcional, pero SIN 'expediente').
insert into organizations (id, slug, name) values
  ('f3d00000-0000-0000-0000-000000000001','noexporg','No Exp Org');
insert into organization_modules (organization_id, module_id, enabled)
select 'f3d00000-0000-0000-0000-000000000001', id, true
  from modules where key = 'calendario'
on conflict do nothing;

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','f3d11111-0000-0000-0000-000000000001','authenticated','authenticated','admin@noexp.mx');
update profiles set organization_id='f3d00000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='f3d11111-0000-0000-0000-000000000001';

-- Nota preexistente (insertada como postgres, bypassa RLS) cuyo autor ES el
-- usuario; aun así NO debe verla sin el módulo activo.
insert into clinical_notes (id, organization_id, professional_id, body) values
  ('f3daaaaa-0000-0000-0000-000000000001','f3d00000-0000-0000-0000-000000000001',
   'f3d11111-0000-0000-0000-000000000001','Nota inaccesible sin módulo');

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('f3d11111-0000-0000-0000-000000000001');

-- ============ (1) SELECT ⇒ 0 filas (org sin módulo expediente) ===============
select is(
  (select count(*)::int from clinical_notes),
  0, 'Tenant SIN módulo expediente NO ve notas clínicas (0 filas, RLS)'
);

-- ============ (2) INSERT ⇒ 42501 (with check exige org_has_module) ===========
select throws_ok(
  $$ insert into clinical_notes (organization_id, professional_id, body)
     values ('f3d00000-0000-0000-0000-000000000001','f3d11111-0000-0000-0000-000000000001','x') $$,
  '42501', NULL,
  'Tenant SIN módulo expediente NO puede insertar notas (RLS 42501)'
);

select finish();
rollback;
