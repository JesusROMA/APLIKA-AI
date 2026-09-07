-- ============================================================================
-- Aplika.ai — 0025 · Bot de ventas por WhatsApp (Twilio)
-- Sesiones conversacionales por (organización, teléfono) para levantar
-- cotizaciones y pedidos por WhatsApp: guardan el estado de la charla y el
-- carrito. Solo las escribe el webhook (service role); el panel no las toca.
-- ============================================================================

create table whatsapp_sales_sessions (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  phone           text not null,                    -- E.164 sin el prefijo "whatsapp:"
  state           text not null default 'product',  -- product | pick | qty | confirm
  doc_type        text not null,                    -- cotizacion | pedido
  customer_id     uuid references customers(id) on delete set null,
  customer_name   text,
  candidates      jsonb not null default '[]',      -- resultados numerados pendientes de elegir
  pending         jsonb,                            -- variante elegida esperando cantidad
  cart            jsonb not null default '[]',      -- [{variantId, sku, name, qty, price, ivaRate}]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, phone)
);
create index idx_wasales_org on whatsapp_sales_sessions(organization_id);

create trigger trg_wasales_touch before update on whatsapp_sales_sessions
  for each row execute function app.touch_updated_at();

-- RLS: el webhook usa service role (bypassa). A usuarios autenticados solo
-- lectura de las sesiones de su organización (diagnóstico); nadie escribe.
alter table whatsapp_sales_sessions enable row level security;
create policy wasales_read on whatsapp_sales_sessions
  for select to authenticated
  using (app.is_super_admin() or organization_id = app.current_org_id());
