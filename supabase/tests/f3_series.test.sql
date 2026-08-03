-- ============================================================================
-- pgTAP — F3 · Series de recurrencia / generar_serie (0016 · C1.2)
--   · Serie semanal con `until` ~4 semanas ⇒ generar_serie devuelve >= 3.
--   · Se materializan >= 3 citas con el series_id correcto.
--   · Todas las citas de la serie llevan el professional_id de la serie.
-- Ejecuta con:  supabase test db
-- ============================================================================
begin;
select plan(3);

create extension if not exists pgtap;

-- --- Setup (como postgres; bypassa RLS) --------------------------------------
-- Org con vertical servicios_agenda ⇒ módulo 'calendario' activo (trigger).
insert into organizations (id, slug, name, vertical_id) values
  ('f3b00000-0000-0000-0000-000000000001','serieorg','Serie Org',
   'b0000000-0000-0000-0000-000000000002');

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000','f3b11111-0000-0000-0000-000000000001','authenticated','authenticated','admin@serie.mx');
update profiles set organization_id='f3b00000-0000-0000-0000-000000000001', role='tenant_admin'
 where id='f3b11111-0000-0000-0000-000000000001';

-- Serie semanal: weekday = el de HOY (primera ocurrencia hoy) y until = hoy + 28
-- días ⇒ ~5 ocurrencias (hoy, +7, +14, +21, +28).
insert into appointment_series (id, organization_id, professional_id, patient_name,
    freq, weekday, start_time, duration_min, until, created_by)
values ('f3baaaaa-0000-0000-0000-000000000001','f3b00000-0000-0000-0000-000000000001',
    'f3b11111-0000-0000-0000-000000000001','Terapia Semanal',
    'semanal', extract(dow from current_date)::int, '09:00', 50,
    current_date + 28, 'f3b11111-0000-0000-0000-000000000001');

create or replace function _login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
end; $$;

select _login('f3b11111-0000-0000-0000-000000000001');

-- ============ (1) generar_serie devuelve >= 3 ================================
select cmp_ok(
  public.generar_serie('f3baaaaa-0000-0000-0000-000000000001'), '>=', 3,
  'generar_serie (semanal, ~4 semanas) crea >= 3 citas'
);

-- ============ (2) Se materializan >= 3 citas con el series_id ================
select cmp_ok(
  (select count(*)::int from appointments where series_id='f3baaaaa-0000-0000-0000-000000000001'),
  '>=', 3,
  'La serie materializó >= 3 citas con series_id correcto'
);

-- ============ (3) Todas llevan el professional_id de la serie ================
select is(
  (select count(*)::int from appointments
    where series_id='f3baaaaa-0000-0000-0000-000000000001'
      and professional_id <> 'f3b11111-0000-0000-0000-000000000001'),
  0,
  'Ninguna cita de la serie tiene un professional_id distinto al de la serie'
);

select finish();
rollback;
