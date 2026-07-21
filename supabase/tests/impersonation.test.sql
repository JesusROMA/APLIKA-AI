-- ============================================================================
-- pgTAP — Impersonación de super_admin vía header PostgREST (0010 · C1.3)
-- current_org_id(): GUC app.impersonate_org → header x-aplika-impersonate
-- (solo super_admin) → profiles.organization_id.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(3);

create extension if not exists pgtap;

-- --- Datos de prueba: 2 orgs, 1 super_admin, 1 tenant_admin ------------------
insert into organizations (id, slug, name) values
  ('b1000000-0000-0000-0000-000000000001','impx','Org X'),
  ('b2000000-0000-0000-0000-000000000002','impy','Org Y');

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','b1111111-0000-0000-0000-000000000001','authenticated','authenticated','super@imp.mx'),
  ('00000000-0000-0000-0000-000000000000','b1111111-0000-0000-0000-000000000002','authenticated','authenticated','tenant@imp.mx');

update profiles set role='super_admin',  organization_id=null
 where id='b1111111-0000-0000-0000-000000000001';
update profiles set role='tenant_admin', organization_id='b1000000-0000-0000-0000-000000000001'
 where id='b1111111-0000-0000-0000-000000000002';

-- --- Helper para simular usuario autenticado ---------------------------------
create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (7) super_admin sin impersonar ⇒ org NULL ======================
select _login('b1111111-0000-0000-0000-000000000001');
select ok(
  public.current_org_id() is null,
  'super_admin sin impersonar: current_org_id() IS NULL'
);

-- ============ (8) super_admin + header ⇒ org impersonada =====================
select set_config(
  'request.headers',
  json_build_object('x-aplika-impersonate','b2000000-0000-0000-0000-000000000002')::text,
  true
);
select is(
  public.current_org_id(),
  'b2000000-0000-0000-0000-000000000002'::uuid,
  'super_admin + header x-aplika-impersonate: current_org_id() = org impersonada'
);

-- ============ (9) tenant normal con el mismo header ⇒ header ignorado ========
select _login('b1111111-0000-0000-0000-000000000002');
select set_config(
  'request.headers',
  json_build_object('x-aplika-impersonate','b2000000-0000-0000-0000-000000000002')::text,
  true
);
select is(
  public.current_org_id(),
  'b1000000-0000-0000-0000-000000000001'::uuid,
  'tenant normal con header impersonate: se ignora y devuelve SU propia org'
);

select finish();
rollback;
