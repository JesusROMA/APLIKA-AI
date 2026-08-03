-- ============================================================================
-- pgTAP — F3 · Notas clínicas / RLS de campo por autor (0016 · C1.3)
--   · El profesional A crea su nota (expediente/crear) ⇒ OK.
--   · A la ve (1 fila).
--   · El profesional B del MISMO tenant NO la ve (0 filas) — protección de campo.
--   · El tenant_admin dueño SÍ la ve (1 fila).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(4);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org con vertical servicios_agenda ⇒ módulo 'expediente' activo (trigger).
insert into organizations (id, slug, name, vertical_id) values
  ('f3c00000-0000-0000-0000-000000000001','notasorg','Notas Org',
   'b0000000-0000-0000-0000-000000000002');

-- Dos profesionales (tenant_user) + un dueño (tenant_admin) del mismo tenant.
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','f3c11111-0000-0000-0000-000000000001','authenticated','authenticated','profa@notas.mx'),
  ('00000000-0000-0000-0000-000000000000','f3c22222-0000-0000-0000-000000000001','authenticated','authenticated','profb@notas.mx'),
  ('00000000-0000-0000-0000-000000000000','f3c33333-0000-0000-0000-000000000001','authenticated','authenticated','admin@notas.mx');
update profiles set organization_id='f3c00000-0000-0000-0000-000000000001', role='tenant_user'
 where id in ('f3c11111-0000-0000-0000-000000000001','f3c22222-0000-0000-0000-000000000001');
update profiles set organization_id='f3c00000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='f3c33333-0000-0000-0000-000000000001';

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

-- ============ (1) Profesional A crea su nota ⇒ OK ============================
select _login('f3c11111-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into clinical_notes (organization_id, professional_id, body)
     values ('f3c00000-0000-0000-0000-000000000001','f3c11111-0000-0000-0000-000000000001',
             'Nota confidencial del profesional A') $$,
  'El profesional A crea su nota clínica (expediente/crear)'
);

-- ============ (2) A ve su propia nota (1 fila) ==============================
select is(
  (select count(*)::int from clinical_notes),
  1, 'El profesional A ve su propia nota (1 fila)'
);

-- ============ (3) B del mismo tenant NO la ve (0 filas) =====================
select _login('f3c22222-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from clinical_notes),
  0, 'El profesional B del mismo tenant NO ve la nota de A (0 filas)'
);

-- ============ (4) El tenant_admin dueño SÍ la ve (1 fila) ===================
select _login('f3c33333-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from clinical_notes),
  1, 'El tenant_admin dueño SÍ ve la nota (1 fila)'
);

select finish();
rollback;
