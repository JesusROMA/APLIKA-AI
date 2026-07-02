-- ============================================================================
-- Aplika.ai — 0005 · Verticales de negocio y módulos activables por tenant
-- Un solo producto, múltiples verticales: cada organización (tenant) tiene un
-- vertical y un conjunto de módulos activos (organization_modules) que el
-- Panel Cliente usa para renderizar su navegación de forma dinámica.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VERTICALS (catálogo global de Aplika)
-- ----------------------------------------------------------------------------
create table verticals (
  id              uuid primary key default uuid_generate_v4(),
  key             text not null unique,            -- 'inventario_pesado' | 'servicios_agenda'
  name            text not null,
  description     text,
  default_modules jsonb not null default '[]'::jsonb, -- array de module.key
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MODULES (catálogo global de módulos del producto)
-- route_prefix = clave de vista en el Panel Cliente (nav dinámico)
-- icon = path SVG (atributo d) que ya usa el nav del panel
-- ----------------------------------------------------------------------------
create table modules (
  id           uuid primary key default uuid_generate_v4(),
  key          text not null unique,
  name         text not null,
  icon         text,
  route_prefix text not null,
  requires     jsonb not null default '[]'::jsonb,  -- dependencias (module.key)
  core         boolean not null default false,       -- no desactivable (dashboard/config)
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ORGANIZATION_MODULES (módulos activos por tenant)
-- ----------------------------------------------------------------------------
create table organization_modules (
  organization_id uuid not null references organizations(id) on delete cascade,
  module_id       uuid not null references modules(id) on delete cascade,
  enabled         boolean not null default true,
  config          jsonb not null default '{}'::jsonb,
  primary key (organization_id, module_id)
);
create index idx_orgmod_org on organization_modules(organization_id);

-- Vertical del tenant
alter table organizations add column vertical_id uuid references verticals(id);

-- ----------------------------------------------------------------------------
-- RLS (mismo patrón que el resto del esquema)
-- ----------------------------------------------------------------------------
alter table verticals            enable row level security;
alter table modules              enable row level security;
alter table organization_modules enable row level security;

-- Catálogos: legibles por cualquier autenticado (como plans); escribe super_admin
create policy verticals_read on verticals
  for select to authenticated, anon using ( true );
create policy verticals_super_write on verticals
  for all to authenticated
  using ( app.is_super_admin() ) with check ( app.is_super_admin() );

create policy modules_read on modules
  for select to authenticated, anon using ( true );
create policy modules_super_write on modules
  for all to authenticated
  using ( app.is_super_admin() ) with check ( app.is_super_admin() );

-- organization_modules: lectura por tenant (o super_admin); escritura super_admin
create policy org_modules_read on organization_modules
  for select to authenticated
  using ( app.is_super_admin() or organization_id = app.current_org_id() );
create policy org_modules_super_write on organization_modules
  for all to authenticated
  using ( app.is_super_admin() ) with check ( app.is_super_admin() );

-- ----------------------------------------------------------------------------
-- assign_default_modules: al asignar vertical a un tenant, inserta sus módulos
-- default (no borra los existentes; editable después desde el panel admin).
-- Versión interna (sin check, para trigger/seed) + wrapper público con permiso.
-- ----------------------------------------------------------------------------
create or replace function app.assign_default_modules(p_org uuid, p_vertical uuid)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  insert into organization_modules (organization_id, module_id, enabled)
  select p_org, m.id, true
  from verticals v
  join modules m on m.key in (select jsonb_array_elements_text(v.default_modules))
  where v.id = p_vertical
  on conflict (organization_id, module_id) do nothing;
end; $$;

create or replace function public.assign_default_modules(p_org uuid, p_vertical uuid)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not (auth.role() = 'service_role' or app.is_super_admin()) then
    raise exception 'forbidden: requiere super_admin' using errcode = '42501';
  end if;
  perform app.assign_default_modules(p_org, p_vertical);
end; $$;
grant execute on function public.assign_default_modules(uuid, uuid) to authenticated, service_role;

-- Trigger: alta de tenant con vertical (o cambio de vertical) → módulos default
create or replace function app.handle_org_vertical()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.vertical_id is not null then
    perform app.assign_default_modules(new.id, new.vertical_id);
  end if;
  return new;
end; $$;

drop trigger if exists trg_org_vertical on organizations;
create trigger trg_org_vertical
  after insert or update of vertical_id on organizations
  for each row execute function app.handle_org_vertical();

-- ----------------------------------------------------------------------------
-- SEED del catálogo (estructural, vive en la migración — el panel admin lo
-- necesita aunque no haya datos demo). IDs fijos para referencias estables.
-- ----------------------------------------------------------------------------
insert into modules (id, key, name, icon, route_prefix, core, sort) values
  ('c0000000-0000-0000-0000-000000000001','dashboard','Inicio','M4 12 12 5l8 7M6 10v10h12V10','inicio',true,1),
  ('c0000000-0000-0000-0000-000000000002','ordenes','Ventas / Pedidos','M6 7h12l-1 13H7zM9 7V5a3 3 0 0 1 6 0v2','ventas',false,2),
  ('c0000000-0000-0000-0000-000000000003','calendario','Calendario / Citas','M4 5H20V20H4ZM4 9H20M8 3.5V6.5M16 3.5V6.5M8.5 13H11M14 16.5H16','calendario',false,3),
  ('c0000000-0000-0000-0000-000000000004','pagos','Pagos','M3 7h18v10H3zM3 11h18M7 15h3','pagos',false,4),
  ('c0000000-0000-0000-0000-000000000005','inventario','Inventario','M12 3 3 7l9 4 9-4zM3 7v10l9 4 9-4V7M12 11v10','inventario',false,5),
  ('c0000000-0000-0000-0000-000000000006','facturacion','Facturación','M7 3h8l3 3v15l-2-1-2 1-2-1-2 1-2-1-2 1V3zM9 9h6M9 12h6M9 15h4','facturacion',false,6),
  ('c0000000-0000-0000-0000-000000000007','crm','CRM Clientes','M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M16 5a3 3 0 0 1 0 6M18 20c0-2-.8-3.5-2-4.5','clientes',false,7),
  ('c0000000-0000-0000-0000-000000000008','ia_agente','Agente IA','M5 5h14v10H8l-3 3zM9 10h.01M13 10h.01M16 10h.01','ia',false,8),
  ('c0000000-0000-0000-0000-000000000009','config','Configuración','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19.4 13a7.5 7.5 0 0 0 .1-1 7.5 7.5 0 0 0-.1-1l1.9-1.4-1.9-3.3-2.2.9a7 7 0 0 0-1.7-1L15 3h-4l-.4 2.2a7 7 0 0 0-1.7 1l-2.2-.9-1.9 3.3L6.7 10a7.5 7.5 0 0 0 0 2l-1.9 1.4 1.9 3.3 2.2-.9a7 7 0 0 0 1.7 1L11 21h4l.4-2.2a7 7 0 0 0 1.7-1l2.2.9 1.9-3.3Z','config',true,9)
on conflict (key) do nothing;

insert into verticals (id, key, name, description, default_modules) values
  ('b0000000-0000-0000-0000-000000000001','inventario_pesado','Inventario pesado',
   'Refaccionarias, ferreterías, autopartes y mayoristas: catálogo grande, pedidos y stock.',
   '["dashboard","ordenes","pagos","inventario","facturacion","crm","ia_agente","config"]'),
  ('b0000000-0000-0000-0000-000000000002','servicios_agenda','Servicios con agenda',
   'Consultorios y profesionales (ej. psicología): citas, cobros y facturación.',
   '["dashboard","calendario","pagos","facturacion","crm","ia_agente","config"]')
on conflict (key) do nothing;
