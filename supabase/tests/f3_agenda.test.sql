-- ============================================================================
-- pgTAP — F3 · Agenda / anti-empalme (0016 · C1.1)
--   · Cita base de un profesional ⇒ OK.
--   · 2ª cita del MISMO profesional traslapada ⇒ exclusion_violation (23P01).
--   · Mismo horario pero DISTINTO profesional ⇒ permitido.
--   · Cita adyacente (11:00-12:00 tras 10:00-11:00) ⇒ permitida (fin exclusivo).
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(4);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org con vertical servicios_agenda ⇒ módulo 'calendario' activo (trigger).
insert into organizations (id, slug, name, vertical_id) values
  ('f3a00000-0000-0000-0000-000000000001','agendaorg','Agenda Org',
   'b0000000-0000-0000-0000-000000000002');

-- Profesional A (admin, hace los inserts) y Profesional B (otro perfil del tenant).
insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','f3a11111-0000-0000-0000-000000000001','authenticated','authenticated','profa@agenda.mx'),
  ('00000000-0000-0000-0000-000000000000','f3a22222-0000-0000-0000-000000000001','authenticated','authenticated','profb@agenda.mx');
update profiles set organization_id='f3a00000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='f3a11111-0000-0000-0000-000000000001';
update profiles set organization_id='f3a00000-0000-0000-0000-000000000001', role='tenant_user'
 where id='f3a22222-0000-0000-0000-000000000001';

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('f3a11111-0000-0000-0000-000000000001');

-- ============ (1) Cita base del profesional A (10:00-11:00) ⇒ OK =============
select lives_ok(
  $$ insert into appointments (organization_id, patient_name, professional_id, starts_at, ends_at)
     values ('f3a00000-0000-0000-0000-000000000001','Paciente 1','f3a11111-0000-0000-0000-000000000001',
             '2030-03-04 10:00:00+00','2030-03-04 11:00:00+00') $$,
  'Cita base del profesional A (10:00-11:00) se crea OK'
);

-- ============ (2) Traslape del MISMO profesional ⇒ 23P01 =====================
select throws_ok(
  $$ insert into appointments (organization_id, patient_name, professional_id, starts_at, ends_at)
     values ('f3a00000-0000-0000-0000-000000000001','Paciente 2','f3a11111-0000-0000-0000-000000000001',
             '2030-03-04 10:30:00+00','2030-03-04 11:30:00+00') $$,
  '23P01', NULL,
  'Cita traslapada del mismo profesional ⇒ exclusion_violation (23P01)'
);

-- ============ (3) DISTINTO profesional, mismo horario ⇒ OK ===================
select lives_ok(
  $$ insert into appointments (organization_id, patient_name, professional_id, starts_at, ends_at)
     values ('f3a00000-0000-0000-0000-000000000001','Paciente 3','f3a22222-0000-0000-0000-000000000001',
             '2030-03-04 10:00:00+00','2030-03-04 11:00:00+00') $$,
  'Distinto profesional en el mismo horario ⇒ permitido'
);

-- ============ (4) Cita adyacente (11:00-12:00) ⇒ OK (fin exclusivo) ==========
select lives_ok(
  $$ insert into appointments (organization_id, patient_name, professional_id, starts_at, ends_at)
     values ('f3a00000-0000-0000-0000-000000000001','Paciente 4','f3a11111-0000-0000-0000-000000000001',
             '2030-03-04 11:00:00+00','2030-03-04 12:00:00+00') $$,
  'Cita adyacente (10:00-11:00 → 11:00-12:00) NO choca ⇒ permitida'
);

select finish();
rollback;
