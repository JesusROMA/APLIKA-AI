# FASE 3 — Clínicas / Agenda · Contratos (fuente de verdad)

> Vertical `servicios_agenda` (consultorios, p.ej. psicología). Extiende lo
> existente: `appointments` (cita con `customer_id` = paciente, `patient_name`,
> `professional_id` → `profiles`, `starts_at`/`ends_at`, `status`
> {agendada,confirmada,completada,cancelada}, `notes`), módulo **`calendario`**.
> Convenciones vigentes (F1/F2): migraciones con `-- ROLLBACK:`, RLS por
> operación con `has_perm`/`org_has_module`, RPCs `app.*` + wrapper `public.*`,
> guards `requireAccess`, endpoints `/api/erp/*`, panel `/app/panel`, tipos
> compartidos del orquestador. **Pacientes = `customers`; profesionales = `profiles`.**

## Alcance
1. **Agenda de citas**: crear/mover/confirmar/completar/cancelar; vista por día/semana y por profesional.
2. **Recurrencia**: series de citas (p.ej. terapia semanal) que generan instancias.
3. **Anti-empalme**: un profesional no puede tener dos citas traslapadas (enforced en BD).
4. **Notas clínicas con RLS de campo**: expediente por paciente; la nota solo la lee el profesional que la escribió (+ dueño), no el resto del staff.

## Decisiones propuestas (marca si cambias alguna)
- **Anti-empalme por constraint de exclusión** (`btree_gist` + `EXCLUDE`), por profesional, ignorando canceladas — lo garantiza la BD, no la app. *(vs. validación por trigger/app).*
- **Recurrencia por serie + instancias materializadas**: `appointment_series` (regla) genera filas reales en `appointments` (ligadas por `series_id`); permite mover/cancelar una sola ocurrencia. *(vs. recurrencia virtual sin filas).*
- **Notas clínicas = tabla propia `clinical_notes` con RLS estricta**: SELECT solo si `professional_id = perfil actual` **o** rol dueño (`tenant_admin`/super_admin). El resto del staff ve la cita pero NO la nota (protección de campo vía tabla aparte). Nuevo módulo **`expediente`** (se agrega a `servicios_agenda`).
- **Sin recordatorios reales** (WhatsApp/email) en esta fase: interfaz/omitido; se apoya en el `EmailProvider` mock si se requiere. Twilio/WhatsApp real NO sin autorización.

---

## C1 · Esquema BD (AGENTE-DB)

### C1.0 · Enums (migración `0015_f3_enums.sql`, aislada por el ADD VALUE)
```
alter type appointment_status add value if not exists 'no_asistio';  -- inasistencia
create type appointment_freq as enum ('semanal','quincenal','mensual');
```

### C1.1 · Extensión de `appointments` (migración `0016_f3_clinicas.sql`)
```sql
alter table appointments
  add column if not exists series_id  uuid,           -- ocurrencia de una serie
  add column if not exists resource   text,           -- consultorio/sala (texto libre)
  add column if not exists price_mxn  numeric(14,2);  -- precio del servicio (opcional)
```
- **Anti-empalme**: `create extension if not exists btree_gist;` +
  `alter table appointments add constraint appt_no_overlap exclude using gist (organization_id with =, professional_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelada');`
  (Traslape del mismo profesional en la misma org ⇒ error `23P01`, que el endpoint traduce a 409.)

### C1.2 · Series de recurrencia
```sql
create table appointment_series (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  professional_id uuid not null references profiles(id),
  customer_id uuid references customers(id),
  patient_name text,
  freq appointment_freq not null default 'semanal',
  weekday int not null,            -- 0=domingo..6=sábado
  start_time time not null,
  duration_min int not null default 60,
  resource text, price_mxn numeric(14,2),
  until date not null,             -- genera hasta esta fecha
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
```
- RPC `public.generar_serie(p_series uuid) returns int` (nº de citas creadas): `has_perm('calendario','crear')`; recorre desde hoy hasta `until` según `freq`/`weekday`/`start_time`; por cada fecha inserta en `appointments` (con `series_id`, `professional_id`, paciente, `starts_at`/`ends_at` de `duration_min`, status 'agendada'); **omite** las que chocarían con el constraint (captura `23P01` por ocurrencia y sigue) y las ya existentes de la serie. Audita.

### C1.3 · Notas clínicas (RLS de campo)
```sql
create table clinical_notes (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  appointment_id uuid references appointments(id),
  customer_id uuid references customers(id),   -- paciente
  professional_id uuid not null references profiles(id),  -- autor (el que atiende)
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```
RLS especial (NO usa el DO-loop genérico):
- SELECT: `app.org_has_module('expediente') and (app.is_super_admin() or professional_id = auth.uid() or app.current_role() = 'tenant_admin')`.
- INSERT: `organization_id = current_org and professional_id = auth.uid() and has_perm('expediente','crear')`.
- UPDATE: autor (`professional_id = auth.uid()`) con `has_perm('expediente','editar')`.
- DELETE: solo super_admin.

### C1.4 · Módulo `expediente`, RBAC, grants
- Registrar módulo `expediente` (Expediente clínico) en `modules`; agregarlo a `verticals.default_modules` de `servicios_agenda`; activarlo en tenants de esa vertical; seed de `role_permissions` (3 roles × 5 acciones, admin=todo, user=ver/crear/editar, viewer=ver — pero la RLS de nota restringe por autor).
- RLS por operación (patrón F0) para `appointment_series` (módulo 'calendario'). `appointments` ya tiene RLS. Bloque de grants base. `-- ROLLBACK:` documental.

## C2 · Tipos TS compartidos (`src/lib/types/erp-clinica.ts` — ORQUESTADOR)
`AppointmentRow`/`AppointmentDetail`, `AppointmentInput`, `SeriesRow`/`SeriesInput`, `ClinicalNoteRow`/`ClinicalNoteInput`, `ProfessionalRef` (de profiles), enums espejo, `AgendaDay`/slots para la vista.

## C3 · Piezas compartidas (mini-tanda orquestador)
- `src/lib/erp/clinica.ts`: helper para listar profesionales del tenant (profiles con rol staff) y pacientes (reusa customers).
- Nav: `calendario` → `/panel/agenda`; `expediente` → `/panel/expediente` en `Sidebar`/`PanelShell`.
- Reutiliza `CustomerPicker` (paciente) y `DataTable`/`Drawer`.

## C4 · Endpoints y páginas por área (Tanda B — 2 agentes ∥)
- **AGENTE-AGENDA** (módulo `calendario`): `src/app/api/erp/appointments/**` (listar por rango/profesional, crear con anti-empalme→409, mover/editar, transicionar estado, cancelar) + `src/app/api/erp/appointment-series/**` (CRUD + generar) + `src/app/panel/agenda/**` (vista semana/día por profesional, alta de cita, series). Traduce `23P01`→409 "empalme".
- **AGENTE-EXPEDIENTE** (módulo `expediente`): `src/app/api/erp/clinical-notes/**` (listar por paciente [solo propias+dueño], crear/editar) + `src/app/panel/expediente/**` (buscar paciente → historial de citas + notas clínicas del profesional). La RLS hace cumplir la confidencialidad; la UI solo refleja.

## C5 · Mapa de propiedad
| Quién | Posee |
|---|---|
| AGENTE-DB (Tanda A) | `supabase/migrations/0015_*`,`0016_*`, `supabase/tests/f3_*.sql`, regen types |
| ORQUESTADOR | `src/lib/types/erp-clinica.ts`, `src/lib/erp/clinica.ts`, nav (Sidebar/PanelShell), integración+QA+git |
| AGENTE-AGENDA | `src/app/api/erp/appointments/**`, `src/app/api/erp/appointment-series/**`, `src/app/panel/agenda/**` |
| AGENTE-EXPEDIENTE | `src/app/api/erp/clinical-notes/**`, `src/app/panel/expediente/**` |

## C6 · Criterios de aceptación F3
- [ ] Crear dos citas traslapadas del mismo profesional ⇒ 409 (anti-empalme por BD); distinto profesional ⇒ permitido.
- [ ] Serie semanal genera N citas hasta `until`, omitiendo empalmes; cancelar/mover una ocurrencia no afecta las demás.
- [ ] Nota clínica: el profesional autor la ve; **otro** profesional del mismo tenant NO la ve (SELECT vacío/403); el dueño (tenant_admin) sí.
- [ ] Estados de cita (agendada→confirmada→completada / cancelada / no_asistio) auditados.
- [ ] Tenant sin módulo `expediente` no accede a notas (RLS); tenant sin `calendario` no accede a agenda.
- [ ] `tsc`/`lint`/`build`/`supabase test db` verdes; sin regresiones en Ventas/Inventario.
