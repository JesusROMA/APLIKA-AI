-- ============================================================================
-- Aplika.ai — 0027 · Bitácora de errores de la aplicación
-- Todo error 5xx de la API queda registrado (ruta, mensaje, tenant, usuario)
-- para el dashboard del super-admin. Escribe solo el server (service role);
-- lee solo el super-admin.
-- ============================================================================

create table app_errors (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete set null,
  user_id         uuid,                       -- actor si había sesión (sin FK: puede borrarse)
  route           text not null,              -- pathname de la API
  method          text not null default 'GET',
  status          integer not null default 500,
  message         text not null,
  stack           text,                       -- primeras líneas del stack
  meta            jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index idx_app_errors_at on app_errors (created_at desc);
create index idx_app_errors_org on app_errors (organization_id);

alter table app_errors enable row level security;
create policy app_errors_admin_read on app_errors
  for select to authenticated
  using (app.is_super_admin());
