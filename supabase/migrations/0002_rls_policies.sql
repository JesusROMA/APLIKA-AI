-- ============================================================================
-- Aplika.ai — 0002 · Funciones helper + Row Level Security
-- Aislamiento total entre tenants: cada fila se filtra por organization_id
-- derivado del usuario autenticado (JWT). super_admin ve todo e impersona.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER para no recursar sobre las políticas de profiles)
-- ----------------------------------------------------------------------------

-- Rol del usuario actual
create or replace function app.current_role()
returns user_role
language sql stable security definer set search_path = public, app as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function app.is_super_admin()
returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select role = 'super_admin' from profiles where id = auth.uid()), false);
$$;

-- Organización efectiva del usuario.
-- Soporta impersonación: si es super_admin y la request trae el GUC
-- app.impersonate_org (lo fija el servidor con service-role en sesiones de
-- soporte), se usa esa organización; si no, su propia organización.
create or replace function app.current_org_id()
returns uuid
language plpgsql stable security definer set search_path = public, app as $$
declare
  imp text;
  oid uuid;
begin
  imp := nullif(current_setting('app.impersonate_org', true), '');
  if imp is not null and app.is_super_admin() then
    return imp::uuid;
  end if;
  select organization_id into oid from profiles where id = auth.uid();
  return oid;
end; $$;

-- Customer (storefront) ligado al usuario actual, si aplica
create or replace function app.current_customer_id()
returns uuid
language sql stable security definer set search_path = public, app as $$
  select id from customers where profile_id = auth.uid() limit 1;
$$;

revoke all on function app.current_role(), app.is_super_admin(), app.current_org_id(), app.current_customer_id() from public;
grant execute on function app.current_role(), app.is_super_admin(), app.current_org_id(), app.current_customer_id() to authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- Habilitar RLS en todas las tablas
-- ----------------------------------------------------------------------------
alter table organizations       enable row level security;
alter table subscriptions       enable row level security;
alter table profiles            enable row level security;
alter table price_lists         enable row level security;
alter table price_list_items    enable row level security;
alter table customers           enable row level security;
alter table products            enable row level security;
alter table product_variants    enable row level security;
alter table warehouses          enable row level security;
alter table inventory           enable row level security;
alter table inventory_movements enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table payments            enable row level security;
alter table invoices            enable row level security;
alter table ai_conversations    enable row level security;
alter table ai_messages         enable row level security;
alter table org_counters        enable row level security;
alter table plans               enable row level security;
alter table leads               enable row level security;
alter table incidents           enable row level security;

-- ----------------------------------------------------------------------------
-- Política genérica de aislamiento por tenant.
-- Se aplica a toda tabla con columna organization_id.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  tenant_tables text[] := array[
    'subscriptions','price_lists','price_list_items','customers','products',
    'product_variants','warehouses','inventory','inventory_movements',
    'orders','order_items','payments','invoices','ai_conversations',
    'ai_messages','org_counters'
  ];
begin
  foreach t in array tenant_tables loop
    execute format($f$
      create policy tenant_isolation on %I
        for all
        to authenticated
        using ( app.is_super_admin() or organization_id = app.current_org_id() )
        with check ( app.is_super_admin() or organization_id = app.current_org_id() );
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- ORGANIZATIONS: el usuario ve su propia org; super_admin ve todas
-- ----------------------------------------------------------------------------
create policy org_select on organizations
  for select to authenticated
  using ( app.is_super_admin() or id = app.current_org_id() );

create policy org_super_write on organizations
  for all to authenticated
  using ( app.is_super_admin() )
  with check ( app.is_super_admin() );

-- ----------------------------------------------------------------------------
-- PROFILES: ves los perfiles de tu organización; super_admin ve todo.
-- (current_org_id/is_super_admin son SECURITY DEFINER => no recursan aquí)
-- ----------------------------------------------------------------------------
create policy profiles_self on profiles
  for select to authenticated
  using (
    id = auth.uid()
    or app.is_super_admin()
    or organization_id = app.current_org_id()
  );

create policy profiles_admin_write on profiles
  for all to authenticated
  using (
    app.is_super_admin()
    or (organization_id = app.current_org_id() and app.current_role() = 'tenant_admin')
  )
  with check (
    app.is_super_admin()
    or (organization_id = app.current_org_id() and app.current_role() = 'tenant_admin')
  );

-- ----------------------------------------------------------------------------
-- PLANS: catálogo legible por cualquier autenticado; sólo super_admin escribe
-- ----------------------------------------------------------------------------
create policy plans_read on plans
  for select to authenticated, anon
  using ( true );
create policy plans_super_write on plans
  for all to authenticated
  using ( app.is_super_admin() )
  with check ( app.is_super_admin() );

-- ----------------------------------------------------------------------------
-- LEADS: inserción pública (landing) vía anon; sólo super_admin los lee.
-- (El endpoint usa service-role + honeypot + rate-limit; este INSERT anon es
--  una segunda barrera por si se llamara con anon key.)
-- ----------------------------------------------------------------------------
create policy leads_public_insert on leads
  for insert to anon, authenticated
  with check ( true );
create policy leads_super_read on leads
  for select to authenticated
  using ( app.is_super_admin() );
create policy leads_super_write on leads
  for update to authenticated
  using ( app.is_super_admin() )
  with check ( app.is_super_admin() );

-- ----------------------------------------------------------------------------
-- INCIDENTS: sólo super_admin
-- ----------------------------------------------------------------------------
create policy incidents_super on incidents
  for all to authenticated
  using ( app.is_super_admin() )
  with check ( app.is_super_admin() );

-- ----------------------------------------------------------------------------
-- Scoping adicional para rol 'customer' (storefront): sólo sus propios datos.
-- Se combina con la política de tenant (ambas deben permitir). Por eso lo
-- expresamos como política RESTRICTIVE sobre las tablas sensibles.
-- ----------------------------------------------------------------------------
create policy customers_self_restrict on customers
  as restrictive for all to authenticated
  using ( app.current_role() <> 'customer' or app.is_super_admin() or id = app.current_customer_id() )
  with check ( app.current_role() <> 'customer' or app.is_super_admin() or id = app.current_customer_id() );

create policy orders_self_restrict on orders
  as restrictive for all to authenticated
  using ( app.current_role() <> 'customer' or app.is_super_admin() or customer_id = app.current_customer_id() )
  with check ( app.current_role() <> 'customer' or app.is_super_admin() or customer_id = app.current_customer_id() );
