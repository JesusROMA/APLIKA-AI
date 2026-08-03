-- ============================================================================
-- Aplika.ai — 0016 · FASE 3 Clínicas/Agenda (contrato C1.1–C1.4)
-- Additiva y no destructiva: extiende `appointments` (columnas nuevas + anti-
-- empalme por constraint de exclusión), agrega series de recurrencia
-- (appointment_series + RPC generar_serie), notas clínicas con RLS de campo
-- (clinical_notes) y el módulo `expediente` (+ RBAC + activación por vertical).
-- Reutiliza los patrones de F0/F1/F2 (0010/0012/0014): helpers app.* SECURITY
-- DEFINER + wrapper public.*, RLS por operación con app.has_perm/
-- app.org_has_module, auditoría vía app.log_audit.
-- Requiere 0015_f3_enums.sql (appointment_freq + 'no_asistio' ya committeados).
--
-- DESVIACIONES respecto a C1 (documentadas):
--  · clinical_notes: la política de INSERT AÑADE `app.org_has_module('expediente')`
--    al WITH CHECK (el contrato C1.3 sólo listaba current_org + autor + has_perm).
--    Motivo: `app.has_perm` NO consulta la activación del módulo (sólo el RBAC por
--    rol, que se siembra global), así que sin este guard un tenant SIN el módulo
--    'expediente' podría insertar notas — contradiciendo C6 y el test
--    f3_rls_expediente ("tenant sin módulo ⇒ INSERT 42501"). El guard es aditivo
--    (sólo RESTRINGE) y alinea la tabla con el patrón del resto del esquema
--    (todas las tablas gatean INSERT por org_has_module). SELECT ya lo incluía.
--  · generar_serie: cadencia 'mensual' = cada 4 semanas (28 días) para conservar
--    el mismo día de la semana (weekday) y evitar saltos por meses de distinta
--    longitud. 'quincenal' = cada 14 días, 'semanal' = cada 7.
-- ============================================================================


-- ============================================================================
-- A · Extensión de `appointments` (C1.1)
-- ============================================================================
alter table appointments
  add column if not exists series_id uuid,           -- ocurrencia de una serie
  add column if not exists resource  text,           -- consultorio/sala (texto libre)
  add column if not exists price_mxn numeric(14,2);  -- precio del servicio (opcional)


-- ============================================================================
-- B · Anti-empalme por constraint de exclusión (C1.1)
-- Traslape del MISMO profesional en la MISMA org ⇒ error 23P01 (el endpoint lo
-- traduce a 409). Ignora las canceladas. tstzrange por defecto es [) (fin
-- exclusivo): 10:00-11:00 y 11:00-12:00 NO chocan (adyacentes válidas).
-- ============================================================================
create extension if not exists btree_gist;

do $$ begin
  alter table appointments add constraint appt_no_overlap
    exclude using gist (
      organization_id with =,
      professional_id with =,
      tstzrange(starts_at, ends_at) with &&
    ) where (status <> 'cancelada');
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- C · Series de recurrencia (C1.2) + RPC generar_serie
-- ============================================================================
create table if not exists appointment_series (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  professional_id uuid not null references profiles(id),
  customer_id     uuid references customers(id),
  patient_name    text,
  freq            appointment_freq not null default 'semanal',
  weekday         int  not null check (weekday between 0 and 6),  -- 0=domingo..6=sábado
  start_time      time not null,
  duration_min    int  not null default 60 check (duration_min > 0),
  resource        text,
  price_mxn       numeric(14,2),
  until           date not null,                 -- genera hasta esta fecha (inclusive)
  active          boolean not null default true,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_appt_series_org on appointment_series(organization_id);
create index if not exists idx_appt_series_prof on appointment_series(organization_id, professional_id);

-- Genera las ocurrencias de una serie como filas reales en `appointments`.
-- SECURITY DEFINER (salta RLS para los INSERT, patrón cobrar_remision) pero:
--   · exige app.has_perm('calendario','crear') del usuario del JWT;
--   · el constraint de exclusión SÍ aplica (no lo salta security definer): las
--     ocurrencias que empalmarían se OMITEN (captura 23P01 por ocurrencia).
-- Devuelve el número de citas efectivamente creadas.
create or replace function app.generar_serie(p_series uuid)
returns int
language plpgsql security definer set search_path = public, app as $$
declare
  s       appointment_series;
  v_step  int;
  v_date  date;
  v_start timestamptz;
  v_end   timestamptz;
  v_count int := 0;
begin
  select * into s from appointment_series where id = p_series;
  if not found then
    raise exception 'serie no encontrada: %', p_series using errcode = 'P0002';
  end if;

  if not app.has_perm('calendario','crear') then
    raise exception 'forbidden: falta permiso calendario/crear' using errcode = '42501';
  end if;

  -- Cadencia (ver DESVIACIONES en la cabecera): días entre ocurrencias.
  v_step := case s.freq
              when 'semanal'   then 7
              when 'quincenal' then 14
              when 'mensual'   then 28
            end;

  -- Arranca en la 1ª fecha >= hoy (o alta de la serie) cuyo dow = weekday.
  v_date := greatest(current_date, s.created_at::date);
  v_date := v_date + ((s.weekday - extract(dow from v_date)::int + 7) % 7);

  while v_date <= s.until loop
    v_start := (v_date + s.start_time)::timestamptz;
    v_end   := v_start + make_interval(mins => s.duration_min);
    begin
      insert into appointments (
        organization_id, customer_id, patient_name, professional_id,
        starts_at, ends_at, status, series_id, resource, price_mxn, created_by
      ) values (
        s.organization_id, s.customer_id, coalesce(s.patient_name, '(sin nombre)'),
        s.professional_id, v_start, v_end, 'agendada', p_series,
        s.resource, s.price_mxn, auth.uid()
      );
      v_count := v_count + 1;
    exception
      when exclusion_violation then   -- 23P01: empalme ⇒ omite esta ocurrencia
        null;
    end;
    v_date := v_date + v_step;
  end loop;

  perform app.log_audit('appointment_series', p_series::text, 'generar',
    jsonb_build_object('creadas', v_count), s.organization_id);

  return v_count;
end; $$;

revoke all on function app.generar_serie(uuid) from public;
grant execute on function app.generar_serie(uuid) to authenticated, service_role;

create or replace function public.generar_serie(p_series uuid)
returns int language sql security definer set search_path = public, app as $$
  select app.generar_serie(p_series);
$$;
grant execute on function public.generar_serie(uuid) to authenticated, service_role;


-- ============================================================================
-- D · Notas clínicas con RLS de campo (C1.3)
-- ============================================================================
create table if not exists clinical_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  appointment_id  uuid references appointments(id) on delete set null,
  customer_id     uuid references customers(id),                  -- paciente
  professional_id uuid not null references profiles(id),          -- autor (quien atiende)
  body            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_clinical_notes_org on clinical_notes(organization_id);
create index if not exists idx_clinical_notes_customer on clinical_notes(organization_id, customer_id);
create index if not exists idx_clinical_notes_prof on clinical_notes(organization_id, professional_id);

drop trigger if exists trg_clinical_notes_touch on clinical_notes;
create trigger trg_clinical_notes_touch before update on clinical_notes
  for each row execute function app.touch_updated_at();

-- RLS ESPECIAL (NO usa el DO-loop genérico): protección de campo por autor.
alter table clinical_notes enable row level security;

-- SELECT: sólo el autor, el tenant_admin dueño o super_admin — y sólo si la org
-- tiene el módulo 'expediente'. El resto del staff ve la cita pero NO la nota.
drop policy if exists clinical_notes_select on clinical_notes;
create policy clinical_notes_select on clinical_notes
  for select to authenticated
  using (
    app.org_has_module('expediente')
    and (
      app.is_super_admin()
      or professional_id = auth.uid()
      or app.current_role() = 'tenant_admin'
    )
  );

-- INSERT: el autor escribe su propia nota en su org, con módulo + permiso.
-- (org_has_module añadido vs C1.3 — ver DESVIACIONES en la cabecera.)
drop policy if exists clinical_notes_insert on clinical_notes;
create policy clinical_notes_insert on clinical_notes
  for insert to authenticated
  with check (
    app.org_has_module('expediente')
    and organization_id = app.current_org_id()
    and professional_id = auth.uid()
    and app.has_perm('expediente','crear')
  );

-- UPDATE: sólo el autor, con permiso de edición; no puede reasignar el autor.
drop policy if exists clinical_notes_update on clinical_notes;
create policy clinical_notes_update on clinical_notes
  for update to authenticated
  using (
    professional_id = auth.uid()
    and app.has_perm('expediente','editar')
  )
  with check ( professional_id = auth.uid() );

-- DELETE: sólo super_admin (las notas no se borran en operación normal).
drop policy if exists clinical_notes_delete on clinical_notes;
create policy clinical_notes_delete on clinical_notes
  for delete to authenticated
  using ( app.is_super_admin() );


-- ============================================================================
-- E · Módulo `expediente` + RBAC + RLS de appointment_series + grants (C1.4)
-- ============================================================================

-- Registro del módulo nuevo (core=false; sort 12; el siguiente UUID libre).
insert into modules (id, key, name, icon, route_prefix, core, sort) values
  ('c0000000-0000-0000-0000-00000000000c','expediente','Expediente clínico',
   'M9 4h6l1 2h3v14H5V6h3zM9 4v2h6V4M10 11h4M12 9v4','expediente',false,12)
on conflict (key) do nothing;

-- Agrega 'expediente' a los default_modules de la vertical servicios_agenda
-- (guard idempotente). Los tenants NUEVOS de esa vertical lo reciben por trigger
-- (trg_org_vertical → assign_default_modules).
update verticals
   set default_modules = default_modules || '["expediente"]'::jsonb
 where key = 'servicios_agenda'
   and not default_modules @> '["expediente"]'::jsonb;

-- Activa 'expediente' en los tenants EXISTENTES de la vertical servicios_agenda.
insert into organization_modules (organization_id, module_id, enabled)
select o.id, m.id, true
  from organizations o
  join verticals v on v.id = o.vertical_id and v.key = 'servicios_agenda'
  cross join modules m
 where m.key = 'expediente'
on conflict (organization_id, module_id) do nothing;

-- Seed de defaults globales de role_permissions (organization_id NULL) para
-- 'expediente' × 3 roles × 5 acciones (misma lógica que 0010/0012).
-- (La RLS de clinical_notes restringe además por autor.)
insert into role_permissions (organization_id, role, module_key, action, allowed)
select
  null, r.role, 'expediente', a.action,
  case
    when r.role = 'tenant_admin' then true
    when r.role = 'tenant_user'  then a.action in ('ver','crear','editar')
    else a.action = 'ver'   -- tenant_viewer
  end
from unnest(array['tenant_admin','tenant_user','tenant_viewer']::user_role[]) as r(role)
cross join unnest(array['ver','crear','editar','cancelar','configurar']) as a(action)
on conflict do nothing;

-- RLS por operación (patrón F0/F1) para appointment_series, gateada por el
-- módulo 'calendario' (la serie es una regla de la agenda).
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('appointment_series', 'calendario')
    ) as t(tbl, mod)
  loop
    execute format('alter table %I enable row level security;', rec.tbl);

    execute format('drop policy if exists %I on %I;', rec.tbl || '_select', rec.tbl);
    execute format($f$
      create policy %I on %I
        for select to authenticated
        using (
          (app.is_super_admin() or organization_id = app.current_org_id())
          and app.org_has_module(%L) and app.has_perm(%L, 'ver')
        );
    $f$, rec.tbl || '_select', rec.tbl, rec.mod, rec.mod);

    execute format('drop policy if exists %I on %I;', rec.tbl || '_insert', rec.tbl);
    execute format($f$
      create policy %I on %I
        for insert to authenticated
        with check (
          (app.is_super_admin() or organization_id = app.current_org_id())
          and app.org_has_module(%L) and app.has_perm(%L, 'crear')
        );
    $f$, rec.tbl || '_insert', rec.tbl, rec.mod, rec.mod);

    execute format('drop policy if exists %I on %I;', rec.tbl || '_update', rec.tbl);
    execute format($f$
      create policy %I on %I
        for update to authenticated
        using (
          (app.is_super_admin() or organization_id = app.current_org_id())
          and app.has_perm(%L, 'editar')
        )
        with check (
          app.is_super_admin() or organization_id = app.current_org_id()
        );
    $f$, rec.tbl || '_update', rec.tbl, rec.mod);

    execute format('drop policy if exists %I on %I;', rec.tbl || '_delete', rec.tbl);
    execute format($f$
      create policy %I on %I
        for delete to authenticated
        using ( app.is_super_admin() );
    $f$, rec.tbl || '_delete', rec.tbl);
  end loop;
end $$;


-- ============================================================================
-- F · Grants base (idéntico al bloque de 0010/0012 — idempotente y seguro).
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables      in schema public to anon, authenticated, service_role;
grant all on all sequences   in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all     on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all     on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;


-- ============================================================================
-- ROLLBACK: (documentación, no ejecutable — orden inverso seguro)
--
-- -- E) módulo + RBAC + RLS series
-- do $$ declare t text := 'appointment_series'; begin
--   execute format('drop policy if exists %I on %I;', t || '_select', t);
--   execute format('drop policy if exists %I on %I;', t || '_insert', t);
--   execute format('drop policy if exists %I on %I;', t || '_update', t);
--   execute format('drop policy if exists %I on %I;', t || '_delete', t);
-- end $$;
-- delete from role_permissions where organization_id is null and module_key = 'expediente';
-- delete from organization_modules om using modules m
--   where om.module_id = m.id and m.key = 'expediente';
-- update verticals set default_modules = default_modules - 'expediente' where key = 'servicios_agenda';
-- delete from modules where key = 'expediente';
--
-- -- D) notas clínicas
-- drop table if exists clinical_notes;   -- arrastra sus policies y trigger
--
-- -- C) series
-- drop function if exists public.generar_serie(uuid);
-- drop function if exists app.generar_serie(uuid);
-- drop table if exists appointment_series;
--
-- -- B) anti-empalme
-- alter table appointments drop constraint if exists appt_no_overlap;
-- -- (btree_gist se deja instalada; es inocua.)
--
-- -- A) columnas de appointments
-- alter table appointments
--   drop column if exists price_mxn,
--   drop column if exists resource,
--   drop column if exists series_id;
-- ============================================================================
