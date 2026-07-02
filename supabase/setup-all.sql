-- ============================================================
-- Aplika.ai — SETUP COMPLETO (pegar en Supabase SQL Editor y Run)
-- Esquema + RLS + lógica + storage + verticales + citas + datos demo.
-- ============================================================

-- >>>>>>>>>>>>>>>>>>>>>>>> supabase/migrations/0001_init_schema.sql <<<<<<<<<<<<<<<<<<<<<<<<
-- ============================================================================
-- Aplika.ai — 0001 · Esquema base (multi-tenant ERP de mayoreo)
-- Proyecto Supabase NUEVO y exclusivo de Aplika (Regla #0).
-- Una sola base de datos; aislamiento por organization_id + RLS (ver 0002).
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Esquema para funciones helper de la app (no exponer por API REST)
create schema if not exists app;

-- ----------------------------------------------------------------------------
-- ENUMS  (los valores de estado coinciden EXACTAMENTE con los que renderiza el
-- frontend Claude Design — no cambiarlos sin tocar la UI)
-- ----------------------------------------------------------------------------
create type org_status        as enum ('activo', 'prueba', 'suspendido');
create type user_role         as enum ('super_admin', 'tenant_admin', 'tenant_user', 'customer');
create type subscription_status as enum ('activa', 'prueba', 'morosa', 'cancelada');
create type order_status       as enum ('borrador', 'confirmado', 'pagado', 'surtido', 'facturado', 'enviado', 'cancelada');
create type payment_status     as enum ('pendiente', 'exitoso', 'fallido', 'reembolsado');
create type invoice_status     as enum ('borrador', 'timbrada', 'cancelada');
create type movement_type      as enum ('entrada', 'salida', 'ajuste');
create type lead_source        as enum ('contacto', 'agenda_demo');
create type ai_role            as enum ('user', 'agent');

-- ----------------------------------------------------------------------------
-- PLANES (catálogo global de Aplika)
-- ----------------------------------------------------------------------------
create table plans (
  id                uuid primary key default uuid_generate_v4(),
  key               text not null unique,              -- basico | pro | enterprise
  name              text not null,
  price_mxn         integer,                            -- null = "a medida"
  price_annual_mxn  integer,
  period            text not null default '/mes',
  max_products      integer,                            -- null = ilimitado
  max_orders_month  integer,
  max_users         integer,
  highlight         boolean not null default false,
  sort              integer not null default 0,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ORGANIZATIONS (tenants)
-- ----------------------------------------------------------------------------
create table organizations (
  id              uuid primary key default uuid_generate_v4(),
  slug            text not null unique,                 -- subdominio: refanorte.aplika.shop
  name            text not null,
  rfc             text,
  phone           text,
  status          org_status not null default 'prueba',
  plan_id         uuid references plans(id),
  allow_backorder boolean not null default false,       -- vender sin stock (configurable)
  logo_url        text,
  brand_color     text default '#0C447C',
  custom_domain   text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_org_slug on organizations(slug);

-- ----------------------------------------------------------------------------
-- SUBSCRIPTIONS (suscripción del tenant al plan de Aplika)
-- ----------------------------------------------------------------------------
create table subscriptions (
  id                     uuid primary key default uuid_generate_v4(),
  organization_id        uuid not null references organizations(id) on delete cascade,
  plan_id                uuid not null references plans(id),
  status                 subscription_status not null default 'prueba',
  stripe_subscription_id text,
  started_at             timestamptz not null default now(),
  current_period_end     timestamptz,
  created_at             timestamptz not null default now()
);
create index idx_sub_org on subscriptions(organization_id);

-- ----------------------------------------------------------------------------
-- PROFILES (1:1 con auth.users)  ·  super_admin tiene organization_id = null
-- ----------------------------------------------------------------------------
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  role            user_role not null default 'tenant_user',
  full_name       text,
  email           text,
  created_at      timestamptz not null default now()
);
create index idx_profiles_org on profiles(organization_id);

-- ----------------------------------------------------------------------------
-- PRICE LISTS (listas de precios de mayoreo)
-- ----------------------------------------------------------------------------
create table price_lists (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,                         -- "Mayoreo A", "Mayoreo B"
  is_default      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_pricelist_org on price_lists(organization_id);

-- ----------------------------------------------------------------------------
-- CUSTOMERS (CRM B2B — clientes mayoristas del tenant)
-- ----------------------------------------------------------------------------
create table customers (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id      uuid references profiles(id),          -- si el cliente entra al storefront
  name            text not null,
  rfc             text,
  regimen_fiscal  text,                                  -- "601 · General de Ley Personas Morales"
  uso_cfdi        text,                                  -- "G03 · Gastos en general"
  contact_name    text,
  phone           text,
  email           text,
  price_list_id   uuid references price_lists(id),
  credit_limit    numeric(14,2) not null default 0,
  credit_days     integer not null default 0,
  discount_pct    numeric(5,2) not null default 0,
  balance         numeric(14,2) not null default 0,      -- saldo por cobrar
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_customer_org on customers(organization_id);

-- ----------------------------------------------------------------------------
-- PRODUCTS + VARIANTS (el SKU vive en la variante)
-- ----------------------------------------------------------------------------
create table products (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  category        text,                                  -- "Frenos", "Filtros"...
  description     text,
  image_url       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_product_org on products(organization_id);

create table product_variants (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  product_id      uuid not null references products(id) on delete cascade,
  sku             text not null,
  name            text not null,
  base_price_mxn  numeric(14,2) not null default 0,
  attributes      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (organization_id, sku)
);
create index idx_variant_org on product_variants(organization_id);
create index idx_variant_product on product_variants(product_id);

create table price_list_items (
  id                 uuid primary key default uuid_generate_v4(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  price_list_id      uuid not null references price_lists(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id) on delete cascade,
  price_mxn          numeric(14,2) not null,
  unique (price_list_id, product_variant_id)
);
create index idx_pli_org on price_list_items(organization_id);

-- ----------------------------------------------------------------------------
-- WAREHOUSES + INVENTORY (multi-almacén)
-- ----------------------------------------------------------------------------
create table warehouses (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,                         -- "Matriz", "Bodega 2"
  code            text,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_wh_org on warehouses(organization_id);

create table inventory (
  id                 uuid primary key default uuid_generate_v4(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id) on delete cascade,
  warehouse_id       uuid not null references warehouses(id) on delete cascade,
  stock              integer not null default 0,
  min_stock          integer not null default 0,
  max_stock          integer not null default 0,
  updated_at         timestamptz not null default now(),
  unique (product_variant_id, warehouse_id)
);
create index idx_inv_org on inventory(organization_id);
create index idx_inv_variant on inventory(product_variant_id);

-- KARDEX (movimientos de inventario)
create table inventory_movements (
  id                 uuid primary key default uuid_generate_v4(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id) on delete cascade,
  warehouse_id       uuid not null references warehouses(id),
  type               movement_type not null,
  qty                integer not null,                   -- con signo (+entrada / -salida)
  reason             text,                               -- "Pedido PD-1042", "Compra OC-318"
  ref_type           text,                               -- 'order' | 'purchase' | 'adjustment'
  ref_id             uuid,
  created_by         uuid references profiles(id),
  created_at         timestamptz not null default now()
);
create index idx_mov_org on inventory_movements(organization_id);
create index idx_mov_variant on inventory_movements(product_variant_id, created_at desc);

-- ----------------------------------------------------------------------------
-- ORDERS + ITEMS
-- ----------------------------------------------------------------------------
create table orders (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  folio           text not null,                         -- "PD-1042"
  customer_id     uuid references customers(id),
  warehouse_id    uuid references warehouses(id),
  status          order_status not null default 'borrador',
  channel         text,                                  -- "Tienda en línea", "Agente IA · WhatsApp", "Mostrador"
  subtotal        numeric(14,2) not null default 0,
  tax             numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  items_count     integer not null default 0,
  notes           text,
  stock_applied   boolean not null default false,        -- evita doble decremento
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, folio)
);
create index idx_order_org_status on orders(organization_id, status);
create index idx_order_org_created on orders(organization_id, created_at desc);

create table order_items (
  id                 uuid primary key default uuid_generate_v4(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  order_id           uuid not null references orders(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  sku                text,
  name               text not null,
  qty                integer not null default 1,
  unit_price         numeric(14,2) not null default 0,
  line_total         numeric(14,2) not null default 0
);
create index idx_oi_org on order_items(organization_id);
create index idx_oi_order on order_items(order_id);

-- ----------------------------------------------------------------------------
-- PAYMENTS (referencia Stripe — el estado lo decide el webhook firmado)
-- ----------------------------------------------------------------------------
create table payments (
  id                       uuid primary key default uuid_generate_v4(),
  organization_id          uuid not null references organizations(id) on delete cascade,
  order_id                 uuid references orders(id),
  customer_id              uuid references customers(id),
  stripe_payment_intent_id text,
  stripe_charge_id         text,                          -- "ch_3Q8aF2"
  method                   text,                          -- "Tarjeta ···4242", "Transferencia SPEI"
  amount                   numeric(14,2) not null default 0,
  currency                 text not null default 'mxn',
  status                   payment_status not null default 'pendiente',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index idx_pay_org on payments(organization_id);
create index idx_pay_pi on payments(stripe_payment_intent_id);

-- ----------------------------------------------------------------------------
-- INVOICES (CFDI 4.0)
-- ----------------------------------------------------------------------------
create table invoices (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  order_id        uuid references orders(id),
  customer_id     uuid references customers(id),
  serie           text not null default 'A',
  folio           text not null,                         -- "1042"
  uuid            text,                                  -- folio fiscal (timbrado)
  regimen         text,
  uso_cfdi        text,
  subtotal        numeric(14,2) not null default 0,
  tax             numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  status          invoice_status not null default 'borrador',
  xml_path        text,                                  -- ruta en Storage
  pdf_path        text,
  timbrada_at     timestamptz,
  cancelada_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (organization_id, serie, folio)
);
create index idx_inv_org_status on invoices(organization_id, status);

-- ----------------------------------------------------------------------------
-- AGENTE IA
-- ----------------------------------------------------------------------------
create table ai_conversations (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  customer_phone   text,
  customer_name    text,
  channel          text not null default 'whatsapp',
  tag              text,                                 -- "Pedido", "Cita", "Info"
  resolved         boolean not null default false,
  appointment      boolean not null default false,
  order_captured   boolean not null default false,
  unread           boolean not null default false,
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index idx_aiconv_org on ai_conversations(organization_id, last_message_at desc);

create table ai_messages (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  conversation_id  uuid not null references ai_conversations(id) on delete cascade,
  role             ai_role not null,
  body             text not null,
  created_at       timestamptz not null default now()
);
create index idx_aimsg_conv on ai_messages(conversation_id, created_at);

-- ----------------------------------------------------------------------------
-- LEADS (landing pública — sin tenant; los gestiona super_admin)
-- ----------------------------------------------------------------------------
create table leads (
  id          uuid primary key default uuid_generate_v4(),
  source      lead_source not null,
  name        text not null,
  business    text,
  contact     text,                                      -- WhatsApp o correo
  message     text,
  industry    text,
  size        text,
  status      text not null default 'nuevo',
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index idx_leads_created on leads(created_at desc);

-- ----------------------------------------------------------------------------
-- INCIDENTS (monitoreo super-admin)
-- ----------------------------------------------------------------------------
create table incidents (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references organizations(id) on delete set null,
  title           text not null,
  detail          text,
  severity        text not null default 'warn',          -- error | warn | ok
  created_at      timestamptz not null default now()
);
create index idx_incidents_created on incidents(created_at desc);

-- ----------------------------------------------------------------------------
-- CONTADORES DE FOLIO por organización (PD-####, factura serie-folio)
-- ----------------------------------------------------------------------------
create table org_counters (
  organization_id uuid not null references organizations(id) on delete cascade,
  entity          text not null,                         -- 'order' | 'invoice'
  value           integer not null default 0,
  primary key (organization_id, entity)
);

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger trg_org_touch       before update on organizations    for each row execute function app.touch_updated_at();
create trigger trg_customer_touch  before update on customers        for each row execute function app.touch_updated_at();
create trigger trg_product_touch   before update on products         for each row execute function app.touch_updated_at();
create trigger trg_order_touch     before update on orders           for each row execute function app.touch_updated_at();
create trigger trg_payment_touch   before update on payments         for each row execute function app.touch_updated_at();
create trigger trg_inventory_touch before update on inventory        for each row execute function app.touch_updated_at();


-- >>>>>>>>>>>>>>>>>>>>>>>> supabase/migrations/0002_rls_policies.sql <<<<<<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>>>>>> supabase/migrations/0003_business_logic.sql <<<<<<<<<<<<<<<<<<<<<<<<
-- ============================================================================
-- Aplika.ai — 0003 · Lógica de negocio (RPC + triggers)
-- Order-to-Cash, kardex atómico, folios. Funciones SECURITY DEFINER que validan
-- el tenant manualmente (porque bypassan RLS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Guard: aborta si la org objetivo no es la del usuario (ni super_admin)
-- ----------------------------------------------------------------------------
create or replace function app.assert_org(p_org uuid)
returns void language plpgsql stable security definer set search_path = public, app as $$
begin
  -- service_role = contexto de servidor de confianza (webhooks Stripe, jobs).
  if auth.role() = 'service_role' then return; end if;
  if not (app.is_super_admin() or p_org = app.current_org_id()) then
    raise exception 'forbidden: org mismatch' using errcode = '42501';
  end if;
end; $$;

-- ----------------------------------------------------------------------------
-- Folios incrementales por organización
-- ----------------------------------------------------------------------------
create or replace function app.next_folio(p_org uuid, p_entity text)
returns integer language plpgsql security definer set search_path = public, app as $$
declare v integer;
begin
  insert into org_counters (organization_id, entity, value)
  values (p_org, p_entity, 1)
  on conflict (organization_id, entity)
  do update set value = org_counters.value + 1
  returning value into v;
  return v;
end; $$;

-- Wrapper público: PostgREST (supabase.rpc) solo expone funciones de `public`.
create or replace function public.next_folio(p_org uuid, p_entity text)
returns integer language sql security definer set search_path = public, app as $$
  select app.next_folio(p_org, p_entity);
$$;
grant execute on function public.next_folio(uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Ajuste / movimiento de inventario (entrada, salida o ajuste) + kardex
-- p_qty con signo. Devuelve la fila de inventario resultante.
-- ----------------------------------------------------------------------------
create or replace function public.adjust_inventory(
  p_variant   uuid,
  p_warehouse uuid,
  p_qty       integer,
  p_type      movement_type default 'ajuste',
  p_reason    text default null,
  p_ref_type  text default 'adjustment',
  p_ref_id    uuid default null
) returns inventory
language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid;
  v_inv inventory;
  v_allow_back boolean;
begin
  select organization_id into v_org from product_variants where id = p_variant;
  if v_org is null then raise exception 'variant not found'; end if;
  perform app.assert_org(v_org);

  select allow_backorder into v_allow_back from organizations where id = v_org;

  insert into inventory (organization_id, product_variant_id, warehouse_id, stock)
  values (v_org, p_variant, p_warehouse, 0)
  on conflict (product_variant_id, warehouse_id) do nothing;

  select * into v_inv from inventory
   where product_variant_id = p_variant and warehouse_id = p_warehouse for update;

  if (v_inv.stock + p_qty) < 0 and not v_allow_back then
    raise exception 'insufficient stock for variant % (have %, need %)',
      p_variant, v_inv.stock, abs(p_qty) using errcode = 'P0001';
  end if;

  update inventory set stock = stock + p_qty, updated_at = now()
   where id = v_inv.id returning * into v_inv;

  insert into inventory_movements
    (organization_id, product_variant_id, warehouse_id, type, qty, reason, ref_type, ref_id, created_by)
  values
    (v_org, p_variant, p_warehouse, p_type, p_qty, p_reason, p_ref_type, p_ref_id, auth.uid());

  return v_inv;
end; $$;

-- ----------------------------------------------------------------------------
-- Aplica el decremento de stock de un pedido (idempotente vía stock_applied)
-- ----------------------------------------------------------------------------
create or replace function app.apply_order_stock(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  v_order  orders;
  v_wh     uuid;
  it       record;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order is null then raise exception 'order not found'; end if;
  if v_order.stock_applied then return; end if;

  v_wh := coalesce(
    v_order.warehouse_id,
    (select id from warehouses where organization_id = v_order.organization_id and is_default order by created_at limit 1),
    (select id from warehouses where organization_id = v_order.organization_id order by created_at limit 1)
  );

  for it in
    select product_variant_id, qty, name from order_items
     where order_id = p_order_id and product_variant_id is not null
  loop
    perform public.adjust_inventory(
      it.product_variant_id, v_wh, -it.qty, 'salida',
      'Pedido ' || v_order.folio, 'order', v_order.id
    );
  end loop;

  update orders set stock_applied = true where id = p_order_id;
end; $$;

-- ----------------------------------------------------------------------------
-- Transición de estado del pedido con validación de pipeline + efectos
-- ----------------------------------------------------------------------------
create or replace function public.transition_order(
  p_order_id uuid,
  p_new      order_status
) returns orders
language plpgsql security definer set search_path = public, app as $$
declare
  v_order  orders;
  v_idx    int;
  v_new    int;
  pipeline order_status[] := array['borrador','confirmado','pagado','surtido','facturado','enviado']::order_status[];
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order is null then raise exception 'order not found'; end if;
  perform app.assert_org(v_order.organization_id);

  if p_new = 'cancelada' then
    if v_order.status in ('facturado','enviado') then
      raise exception 'no se puede cancelar un pedido %', v_order.status;
    end if;
    update orders set status = 'cancelada', updated_at = now() where id = p_order_id returning * into v_order;
    return v_order;
  end if;

  if v_order.status = 'cancelada' then
    raise exception 'pedido cancelado: transición no permitida';
  end if;

  select array_position(pipeline, v_order.status) into v_idx;
  select array_position(pipeline, p_new) into v_new;
  if v_new is null then raise exception 'estado destino inválido'; end if;
  if v_new < v_idx then raise exception 'no se permite retroceder de % a %', v_order.status, p_new; end if;

  -- Aplica stock al alcanzar pagado/surtido por primera vez
  if p_new in ('pagado','surtido','facturado','enviado') then
    perform app.apply_order_stock(p_order_id);
  end if;

  update orders set status = p_new, updated_at = now() where id = p_order_id returning * into v_order;
  return v_order;
end; $$;

grant execute on function public.adjust_inventory(uuid,uuid,integer,movement_type,text,text,uuid) to authenticated, service_role;
grant execute on function public.transition_order(uuid, order_status) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Alta de profile al registrarse un usuario (Supabase Auth)
-- La organización se asigna después por el flujo de invitación/onboarding.
-- ----------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'tenant_user')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();


-- >>>>>>>>>>>>>>>>>>>>>>>> supabase/migrations/0004_storage.sql <<<<<<<<<<<<<<<<<<<<<<<<
-- ============================================================================
-- Aplika.ai — 0004 · Storage (XML/PDF de CFDI y branding)
-- Buckets privados; las rutas se prefijan con el organization_id para aislar.
-- ============================================================================

insert into storage.buckets (id, name, public) values
  ('cfdi', 'cfdi', false),
  ('branding', 'branding', true)
on conflict (id) do nothing;

-- CFDI: cada usuario solo ve los archivos de su organización (carpeta = org id).
-- La subida la hace el servidor con service-role (bypassa RLS); estas políticas
-- cubren lecturas con la sesión del usuario.
create policy cfdi_read_own_org on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cfdi'
    and (
      app.is_super_admin()
      or (storage.foldername(name))[1] = app.current_org_id()::text
    )
  );

-- Branding es público de lectura (logos de tiendas).
create policy branding_public_read on storage.objects
  for select to anon, authenticated
  using ( bucket_id = 'branding' );

create policy branding_write_own_org on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = app.current_org_id()::text
  );


-- >>>>>>>>>>>>>>>>>>>>>>>> supabase/migrations/0005_verticals_modules.sql <<<<<<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>>>>>> supabase/migrations/0006_appointments.sql <<<<<<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>>>>>> supabase/seed.sql <<<<<<<<<<<<<<<<<<<<<<<<
-- ============================================================================
-- Aplika.ai — seed demo (coherente con el frontend Claude Design)
-- Tenant principal: "Refaccionaria del Norte" (Plan Pro).
-- Crea usuarios de auth, organización, catálogo, inventario, clientes, pedidos,
-- pagos, facturas, IA, leads e incidencias. Usuarios super-admin y tenant.
-- Password de TODOS los usuarios demo: Aplika2026!
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PLANES
-- ---------------------------------------------------------------------------
insert into plans (id, key, name, price_mxn, price_annual_mxn, period, max_products, max_orders_month, max_users, highlight, sort) values
  ('a0000000-0000-0000-0000-000000000001','basico','Básico',990,790,'/mes',500,1000,3,false,1),
  ('a0000000-0000-0000-0000-000000000002','pro','Pro',2490,1990,'/mes',5000,10000,10,true,2),
  ('a0000000-0000-0000-0000-000000000003','enterprise','Enterprise',null,null,'',null,null,null,false,3)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- USUARIOS (auth.users) — el trigger crea profiles automáticamente
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000aa','authenticated','authenticated',
   'admin@aplika.ai', crypt('Aplika2026!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Aplika.ai","role":"super_admin"}'),
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000b1','authenticated','authenticated',
   'juan@refanorte.mx', crypt('Aplika2026!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Juan Méndez","role":"tenant_admin"}'),
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000b2','authenticated','authenticated',
   'carla@refanorte.mx', crypt('Aplika2026!', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Carla Ruiz","role":"tenant_user"}')
on conflict (id) do nothing;

-- GoTrue requiere que estas columnas de token sean cadena vacía (no NULL) para
-- poder iniciar sesión con usuarios insertados directamente en auth.users.
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where id in ('d0000000-0000-0000-0000-0000000000aa','d0000000-0000-0000-0000-0000000000b1','d0000000-0000-0000-0000-0000000000b2');

-- ---------------------------------------------------------------------------
-- ORGANIZATIONS (varias para la vista super-admin)
-- ---------------------------------------------------------------------------
insert into organizations (id, slug, name, rfc, phone, status, plan_id, created_at) values
  ('11111111-1111-1111-1111-111111111111','refanorte','Refaccionaria del Norte','RNO180412QX3','81 1234 5678','activo','a0000000-0000-0000-0000-000000000002','2026-01-12'),
  ('11111111-1111-1111-1111-111111111112','salinas','Autopartes Salinas',null,null,'activo','a0000000-0000-0000-0000-000000000002','2025-11-21'),
  ('11111111-1111-1111-1111-111111111113','centro','Distribuidora Centro',null,null,'activo','a0000000-0000-0000-0000-000000000003','2025-09-08'),
  ('11111111-1111-1111-1111-111111111114','herradura','Ferretería La Herradura',null,null,'activo','a0000000-0000-0000-0000-000000000001','2026-02-03'),
  ('11111111-1111-1111-1111-111111111115','frenosgt','Balatas y Frenos GT',null,null,'prueba','a0000000-0000-0000-0000-000000000001','2026-06-19'),
  ('11111111-1111-1111-1111-111111111116','hidalgo','Mayoreo Hidalgo',null,null,'suspendido','a0000000-0000-0000-0000-000000000002','2026-03-04'),
  ('11111111-1111-1111-1111-111111111117','express','Refacciones Express',null,null,'activo','a0000000-0000-0000-0000-000000000001','2026-04-27'),
  ('11111111-1111-1111-1111-111111111118','dnorte','Distribuidora Norte',null,null,'activo','a0000000-0000-0000-0000-000000000003','2025-12-14')
on conflict (id) do nothing;

-- Suscripción del tenant principal
insert into subscriptions (organization_id, plan_id, status, started_at, current_period_end) values
  ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002','activa','2026-01-12','2026-07-12')
on conflict do nothing;

-- Asignar organización + rol a los profiles del tenant principal
update profiles set organization_id='11111111-1111-1111-1111-111111111111', role='tenant_admin' where id='d0000000-0000-0000-0000-0000000000b1';
update profiles set organization_id='11111111-1111-1111-1111-111111111111', role='tenant_user'  where id='d0000000-0000-0000-0000-0000000000b2';
update profiles set role='super_admin', organization_id=null where id='d0000000-0000-0000-0000-0000000000aa';

-- ---------------------------------------------------------------------------
-- ALMACENES + LISTAS DE PRECIOS (tenant principal)
-- ---------------------------------------------------------------------------
insert into warehouses (id, organization_id, name, code, is_default) values
  ('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Matriz','MTZ',true),
  ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Bodega 2','BG2',false)
on conflict (id) do nothing;

insert into price_lists (id, organization_id, name, is_default) values
  ('33333333-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Mayoreo A',true),
  ('33333333-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Mayoreo B',false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- PRODUCTOS + VARIANTES + INVENTARIO  (mismos SKUs/valores que la UI)
-- ---------------------------------------------------------------------------
do $$
declare
  org uuid := '11111111-1111-1111-1111-111111111111';
  rec record;
  pid uuid;
  vid uuid;
  wh  uuid;
begin
  for rec in
    select * from (values
      ('BAL-1184','Balata cerámica D-1184','Frenos','MTZ',6,20,120,420),
      ('FIL-FX90','Filtro de aceite FX-90','Filtros','MTZ',142,40,300,189),
      ('BUJ-NGK6','Bujía iridio NGK 6','Encendido','BG2',0,30,200,95),
      ('AMO-DEL1','Amortiguador delantero GT','Suspensión','MTZ',34,15,80,640),
      ('BAN-4PK','Banda 4PK-1230','Motor','BG2',3,15,90,230),
      ('ACE-2050','Aceite 20W-50 (caja 12)','Lubricantes','MTZ',8,25,150,980),
      ('CLU-VAL','Kit de clutch Valeo','Transmisión','MTZ',12,8,40,2480),
      ('BAL-S220','Balata semimetálica S-220','Frenos','BG2',58,20,120,380),
      ('FOC-H4','Foco halógeno H4','Eléctrico','MTZ',0,50,400,65),
      ('ANT-VW','Anticongelante VW (galón)','Lubricantes','MTZ',96,30,180,310)
    ) as t(sku,name,cat,wh,stock,mins,maxs,price)
  loop
    insert into products (organization_id, name, category) values (org, rec.name, rec.cat) returning id into pid;
    insert into product_variants (organization_id, product_id, sku, name, base_price_mxn)
      values (org, pid, rec.sku, rec.name, rec.price) returning id into vid;
    select id into wh from warehouses where organization_id=org and code=rec.wh;
    insert into inventory (organization_id, product_variant_id, warehouse_id, stock, min_stock, max_stock)
      values (org, vid, wh, rec.stock, rec.mins, rec.maxs);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- CLIENTES (CRM B2B)
-- ---------------------------------------------------------------------------
insert into customers (organization_id, name, rfc, regimen_fiscal, uso_cfdi, contact_name, phone, price_list_id, credit_limit, credit_days, discount_pct, balance) values
  ('11111111-1111-1111-1111-111111111111','Autopartes Salinas','AAS210405JK8','601 · General de Ley Personas Morales','G03 · Gastos en general','Jorge Salinas','477 123 4567','33333333-0000-0000-0000-000000000001',50000,30,5,12480),
  ('11111111-1111-1111-1111-111111111111','Ferretería La Herradura','FHE180922QP1','612 · PF con Actividades Empresariales','G03 · Gastos en general','Patricia Gómez','222 765 4321','33333333-0000-0000-0000-000000000002',20000,15,3,3950),
  ('11111111-1111-1111-1111-111111111111','Distribuidora Centro','DCE150311MN4','601 · General de Ley Personas Morales','G01 · Adquisición de mercancías','Luis Ramírez','55 8899 1020','33333333-0000-0000-0000-000000000001',80000,30,7,0),
  ('11111111-1111-1111-1111-111111111111','Mayoreo Hidalgo','MHI170605RT7','601 · General de Ley Personas Morales','G01 · Adquisición de mercancías','Ana Torres','771 456 7890','33333333-0000-0000-0000-000000000001',60000,45,6,15380),
  ('11111111-1111-1111-1111-111111111111','Refaccionaria del Bajío','RBA200714TX9','601 · General de Ley Personas Morales','G03 · Gastos en general','Mario Vega','461 234 5678','33333333-0000-0000-0000-000000000002',30000,30,4,6720),
  ('11111111-1111-1111-1111-111111111111','Distribuidora Norte','DNO140726PL6','601 · General de Ley Personas Morales','G03 · Gastos en general','Sofía Núñez','81 3344 5566','33333333-0000-0000-0000-000000000001',70000,30,6,11750)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- PEDIDOS (mismos folios/estados que la UI; se insertan con estado final ya
-- fijado para preservar el demo — el flujo real usa transition_order()).
-- ---------------------------------------------------------------------------
do $$
declare
  org uuid := '11111111-1111-1111-1111-111111111111';
  wh  uuid := '22222222-0000-0000-0000-000000000001';
  rec record;
  cust uuid;
  oid uuid;
  sub numeric;
begin
  for rec in
    select * from (values
      ('PD-1042','Autopartes Salinas','2026-06-12',8,12480,'enviado','Tienda en línea'),
      ('PD-1041','Ferretería La Herradura','2026-06-12',3,3950,'confirmado','Agente IA · WhatsApp'),
      ('PD-1040','Distribuidora Centro','2026-06-11',15,28100,'surtido','Tienda en línea'),
      ('PD-1039','Refaccionaria del Bajío','2026-06-11',5,6720,'facturado','Mostrador'),
      ('PD-1038','Balatas y Frenos GT','2026-06-10',2,1240,'borrador','Mostrador'),
      ('PD-1037','Mayoreo Hidalgo','2026-06-10',12,15380,'pagado','Agente IA · WhatsApp'),
      ('PD-1036','Autopartes del Valle','2026-06-09',6,8900,'enviado','Tienda en línea'),
      ('PD-1035','Ferretería Industrial MX','2026-06-09',20,41200,'pagado','Tienda en línea'),
      ('PD-1034','Refacciones Express','2026-06-08',1,640,'cancelada','Mostrador'),
      ('PD-1033','Distribuidora Norte','2026-06-08',9,11750,'facturado','Agente IA · WhatsApp')
    ) as t(folio,client,fecha,items,total,status,channel)
  loop
    select id into cust from customers where organization_id=org and name=rec.client limit 1;
    sub := round(rec.total / 1.16, 2);
    insert into orders (organization_id, folio, customer_id, warehouse_id, status, channel,
      subtotal, tax, total, items_count, stock_applied, created_at)
    values (org, rec.folio, cust, wh, rec.status::order_status, rec.channel,
      sub, rec.total - sub, rec.total, rec.items,
      rec.status in ('pagado','surtido','facturado','enviado'), rec.fecha::timestamptz)
    returning id into oid;

    -- líneas demo (3 conceptos representativos)
    insert into order_items (organization_id, order_id, sku, name, qty, unit_price, line_total) values
      (org, oid, 'BAL-1184','Balata cerámica D-1184', 24, 420, 10080),
      (org, oid, 'FIL-FX90','Filtro de aceite FX-90', 12, 189, 2268),
      (org, oid, 'BUJ-NGK6','Bujía iridio NGK 6', 8, 95, 760);
  end loop;
  -- contador de folios alineado
  insert into org_counters (organization_id, entity, value) values (org,'order',1042)
    on conflict (organization_id, entity) do update set value = 1042;
end $$;

-- ---------------------------------------------------------------------------
-- PAGOS (Stripe demo)
-- ---------------------------------------------------------------------------
do $$
declare org uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into payments (organization_id, order_id, stripe_charge_id, method, amount, status, created_at)
  select org, o.id, v.chg, v.metodo, v.amount, v.status::payment_status, v.fecha::timestamptz
  from (values
    ('PD-1042','ch_3Q8aF2','Tarjeta ···4242',12480,'exitoso','2026-06-12'),
    ('PD-1040','ch_3Q8bG7','Tarjeta ···1881',28100,'exitoso','2026-06-11'),
    ('PD-1041','ch_3Q8cH1','Transferencia SPEI',3950,'pendiente','2026-06-12'),
    ('PD-1037','ch_3Q8dJ9','Tarjeta ···0005',15380,'exitoso','2026-06-10'),
    ('PD-1034','ch_3Q8eK4','Tarjeta ···4242',640,'reembolsado','2026-06-08'),
    ('PD-1033','ch_3Q8gM8','Transferencia SPEI',11750,'exitoso','2026-06-08')
  ) as v(folio,chg,metodo,amount,status,fecha)
  join orders o on o.organization_id=org and o.folio=v.folio;
end $$;

-- ---------------------------------------------------------------------------
-- FACTURAS (CFDI 4.0 demo)
-- ---------------------------------------------------------------------------
do $$
declare org uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into invoices (organization_id, order_id, customer_id, serie, folio, uuid, regimen, uso_cfdi, subtotal, tax, total, status, timbrada_at, created_at)
  select org, o.id, o.customer_id, 'A', v.folio, v.uuid, v.regimen, v.uso,
         round(v.total/1.16,2), v.total - round(v.total/1.16,2), v.total, v.status::invoice_status,
         case when v.status='timbrada' then v.fecha::timestamptz end, v.fecha::timestamptz
  from (values
    ('1042','7A3E9C1B-4F22-4D8A-9E15-0B27C4D1F8A2','601 · General de Ley Personas Morales','G03 · Gastos en general',12480,'timbrada','2026-06-12','PD-1042'),
    ('1041',null,'612 · PF con Actividades Empresariales','G03 · Gastos en general',3950,'borrador','2026-06-12','PD-1041'),
    ('1040','C18B2E55-91A7-4C3D-B6F0-2A9E7D104B6F','601 · General de Ley Personas Morales','G03 · Gastos en general',28100,'timbrada','2026-06-11','PD-1040'),
    ('1039','E2D4A810-77BC-4F90-8C21-5B3F9A6E2C77','601 · General de Ley Personas Morales','G01 · Adquisición de mercancías',6720,'timbrada','2026-06-11','PD-1039'),
    ('1033','D5B8F02C-1E47-4A93-B2C6-8F31A9E0D746','601 · General de Ley Personas Morales','G03 · Gastos en general',11750,'timbrada','2026-06-08','PD-1033')
  ) as v(folio,uuid,regimen,uso,total,status,fecha,pedido)
  left join orders o on o.organization_id=org and o.folio=v.pedido;
  insert into org_counters (organization_id, entity, value) values (org,'invoice',1042)
    on conflict (organization_id, entity) do update set value = 1042;
end $$;

-- ---------------------------------------------------------------------------
-- AGENTE IA (conversaciones demo)
-- ---------------------------------------------------------------------------
do $$
declare org uuid := '11111111-1111-1111-1111-111111111111'; conv uuid;
begin
  insert into ai_conversations (organization_id, customer_phone, customer_name, tag, resolved, order_captured, unread, last_message_at)
  values (org,'+52 477 123 4567','Jorge Salinas','Pedido',true,true,true, now())
  returning id into conv;
  insert into ai_messages (organization_id, conversation_id, role, body) values
    (org, conv,'user','¿Tienen balatas para Versa 2019?'),
    (org, conv,'agent','¡Sí! Tenemos 3 opciones en stock. ¿Cerámicas o semimetálicas?'),
    (org, conv,'user','Cerámicas, apártamelas.'),
    (org, conv,'agent','Listo, pedido PD-1042 creado por $12,480.');
  insert into ai_conversations (organization_id, customer_phone, customer_name, tag, resolved, appointment, last_message_at) values
    (org,'+52 222 765 4321','Patricia Gómez','Cita',true,true, now() - interval '40 min'),
    (org,'+52 55 8899 1020','Luis Ramírez','Pedido',true,false, now() - interval '1 day'),
    (org,'+52 771 456 7890','Ana Torres','Info',true,false, now() - interval '1 day');
end $$;

-- ---------------------------------------------------------------------------
-- LEADS + INCIDENTES
-- ---------------------------------------------------------------------------
insert into leads (source, name, business, contact, message, industry, size) values
  ('agenda_demo','Laura Méndez','Refaccionaria del Centro','55 1234 5678','Quiero ver la demo','Refaccionaria','1,000 a 10,000'),
  ('contacto','Carlos Ruiz','Ferretería Ruiz','carlos@ruiz.mx','¿Cuánto cuesta el plan Pro?',null,null);

insert into incidents (organization_id, title, detail, severity, created_at) values
  ('11111111-1111-1111-1111-111111111116','Webhook de Stripe falló','reintentando (3/5)','error', now() - interval '8 min'),
  ('11111111-1111-1111-1111-111111111115','Timbrado CFDI rechazado','PAC · certificado del tenant','warn', now() - interval '32 min'),
  ('11111111-1111-1111-1111-111111111112','Pico de uso de API','91% del límite de plan','warn', now() - interval '1 hour'),
  ('11111111-1111-1111-1111-111111111113','Agente de IA reconectado','WhatsApp','ok', now() - interval '2 hour');

-- ---------------------------------------------------------------------------
-- VERTICALES Y MÓDULOS (0005) — asignación de vertical a tenants demo
-- El trigger trg_org_vertical inserta los módulos default de cada vertical.
-- ---------------------------------------------------------------------------
update organizations set vertical_id = 'b0000000-0000-0000-0000-000000000001'
 where vertical_id is null
   and slug in ('refanorte','salinas','centro','herradura','frenosgt','hidalgo','express','dnorte');

-- Segundo tenant demo: vertical 'servicios_agenda' (consultorio de psicología)
insert into organizations (id, slug, name, status, plan_id, vertical_id, created_at) values
  ('11111111-1111-1111-1111-111111111119','vitalis','Consultorio Vitalis','activo',
   'a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','2026-05-15')
on conflict (id) do nothing;

-- Usuaria tenant_admin del consultorio (password Aplika2026!)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000b3',
  'authenticated','authenticated','ana@vitalis.mx', crypt('Aplika2026!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Ana Sofía Rivera","role":"tenant_admin"}',
  '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

update profiles set organization_id='11111111-1111-1111-1111-111111111119', role='tenant_admin'
 where id='d0000000-0000-0000-0000-0000000000b3';

-- ---------------------------------------------------------------------------
-- CITAS DEMO (0006 · Consultorio Vitalis, módulo calendario)
-- Horarios relativos a now() para que el demo siempre se vea vigente.
-- ---------------------------------------------------------------------------
insert into appointments (organization_id, patient_name, professional_id, starts_at, ends_at, status, notes) values
  ('11111111-1111-1111-1111-111111111119','Mariana López','d0000000-0000-0000-0000-0000000000b3',
   date_trunc('hour', now()) - interval '3 hour', date_trunc('hour', now()) - interval '3 hour' + interval '50 min','completada','Sesión de seguimiento'),
  ('11111111-1111-1111-1111-111111111119','Carlos Estrada','d0000000-0000-0000-0000-0000000000b3',
   date_trunc('hour', now()) + interval '2 hour', date_trunc('hour', now()) + interval '2 hour' + interval '50 min','confirmada','Primera consulta'),
  ('11111111-1111-1111-1111-111111111119','Lucía Fernández','d0000000-0000-0000-0000-0000000000b3',
   date_trunc('hour', now()) + interval '4 hour', date_trunc('hour', now()) + interval '4 hour' + interval '50 min','agendada','Terapia individual'),
  ('11111111-1111-1111-1111-111111111119','Roberto Díaz','d0000000-0000-0000-0000-0000000000b3',
   date_trunc('hour', now()) + interval '1 day' + interval '1 hour', date_trunc('hour', now()) + interval '1 day' + interval '1 hour' + interval '50 min','agendada','Sesión de pareja'),
  ('11111111-1111-1111-1111-111111111119','Sofía Marín','d0000000-0000-0000-0000-0000000000b3',
   date_trunc('hour', now()) + interval '2 day', date_trunc('hour', now()) + interval '2 day' + interval '50 min','cancelada','Reagendará la próxima semana');


