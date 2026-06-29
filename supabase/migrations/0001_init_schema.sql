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
