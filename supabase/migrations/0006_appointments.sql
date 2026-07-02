-- ============================================================================
-- Aplika.ai — 0006 · Módulo Calendario/Citas (vertical servicios_agenda)
-- Mismo patrón que orders/inventory: organization_id + RLS por tenant.
-- ============================================================================

create type appointment_status as enum ('agendada', 'confirmada', 'completada', 'cancelada');

create table appointments (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id     uuid references customers(id),          -- paciente con ficha CRM (opcional)
  patient_name    text not null,                          -- nombre mostrado (walk-in o CRM)
  professional_id uuid references profiles(id),           -- profesional que atiende
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          appointment_status not null default 'agendada',
  notes           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index idx_appt_org_starts on appointments(organization_id, starts_at);

create trigger trg_appt_touch before update on appointments
  for each row execute function app.touch_updated_at();

-- RLS: aislamiento por tenant (mismo patrón que el resto del esquema)
alter table appointments enable row level security;
create policy tenant_isolation on appointments
  for all to authenticated
  using ( app.is_super_admin() or organization_id = app.current_org_id() )
  with check ( app.is_super_admin() or organization_id = app.current_org_id() );
