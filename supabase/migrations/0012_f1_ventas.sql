-- ============================================================================
-- Aplika.ai — 0012 · FASE 1 Ventas (quote-to-cash) · Contrato C1.1–C1.8
-- Additiva y no destructiva: NO reescribe la numeración de folios de
-- orders/invoices existentes (org_counters/next_folio siguen igual); NO borra
-- ni renombra tablas/columnas. Reutiliza los patrones de F0 (0003/0005/0010):
-- wrapper app.* SECURITY DEFINER + public.*, RLS por operación con
-- app.has_perm/app.org_has_module, auditoría vía app.log_audit.
-- Requiere 0011_f1_enums.sql (valores de enum nuevos ya committeados).
--
-- DESVIACIONES respecto a C1 (documentadas):
--  · order_items.qty_delivered es INTEGER (no numeric) para casar con el tipo
--    real de order_items.qty (INTEGER) — el contrato asumía numeric(14,3).
--  · transition_order gana 'surtido_parcial' DENTRO del array lineal (entre
--    'pagado' y 'surtido') para que array_position no rompa; el resto del cuerpo
--    es copia EXACTA de la v2 de 0010 (guardas has_perm, cancelar, audit, stock).
--  · invoice_sales_notes agrega organization_id (no estaba en C1.5) para poder
--    aplicar el patrón RLS por operación idéntico al de 0010 (org-match).
--  · sales_note_items.qty es numeric(14,3); adjust_inventory exige integer, así
--    que en cobrar_remision se castea con round(qty)::int (documentado in situ).
-- ============================================================================


-- ============================================================================
-- A · SERIES DE FOLIO (org_series) — additiva; extiende org_counters (C1.1)
-- ============================================================================
create table if not exists org_series (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  doc_type        text not null,               -- 'quote'|'order'|'sales_note'|'invoice'
  serie           text not null default 'A',
  prefix          text not null,               -- 'COT'|'PED'|'REM'|'FAC'
  next_value      int  not null default 1,     -- siguiente número a asignar
  is_default      boolean not null default true,
  unique (organization_id, doc_type, serie)
);
create index if not exists idx_org_series_org on org_series(organization_id, doc_type);

-- RPC atómica: bloquea la fila (FOR UPDATE), la crea si no existe con el prefix
-- por defecto del doc_type, incrementa y devuelve "PREFIX-SERIE-0001".
-- SECURITY DEFINER (bypassa RLS, igual que app.next_folio de 0003). serie NULL
-- ⇒ serie por defecto 'A' (la fila is_default sembrada abajo).
create or replace function app.next_serie_folio(
  p_org      uuid,
  p_doc_type text,
  p_serie    text default null
) returns text
language plpgsql security definer set search_path = public, app as $$
declare
  v_serie  text := coalesce(p_serie, 'A');
  v_prefix text;
  v_val    int;
  v_row    org_series;
begin
  v_prefix := case p_doc_type
    when 'quote'      then 'COT'
    when 'order'      then 'PED'
    when 'sales_note' then 'REM'
    when 'invoice'    then 'FAC'
    else upper(left(p_doc_type, 3)) end;

  select * into v_row from org_series
   where organization_id = p_org and doc_type = p_doc_type and serie = v_serie
   for update;

  if not found then
    insert into org_series (organization_id, doc_type, serie, prefix, next_value)
    values (p_org, p_doc_type, v_serie, v_prefix, 1)
    on conflict (organization_id, doc_type, serie) do nothing;
    -- re-lee con lock (cubre carrera de creación concurrente)
    select * into v_row from org_series
     where organization_id = p_org and doc_type = p_doc_type and serie = v_serie
     for update;
  end if;

  update org_series set next_value = next_value + 1
   where id = v_row.id
   returning next_value into v_val;   -- v_val = valor YA incrementado

  return v_row.prefix || '-' || v_serie || '-' || lpad((v_val - 1)::text, 4, '0');
end; $$;

create or replace function public.next_serie_folio(
  p_org uuid, p_doc_type text, p_serie text default null
) returns text
language sql security definer set search_path = public, app as $$
  select app.next_serie_folio(p_org, p_doc_type, p_serie);
$$;
grant execute on function public.next_serie_folio(uuid, text, text) to authenticated, service_role;

-- Seed: una fila por (org existente, doc_type). No afecta la numeración vieja
-- (orders/invoices siguen usando org_counters/next_folio); esto es para
-- documentos NUEVOS de F1. next_value=1 para todos (arrancan en 0001).
insert into org_series (organization_id, doc_type, serie, prefix, next_value)
select o.id, dt.doc_type, 'A', dt.prefix, 1
  from organizations o
  cross join (values
    ('quote','COT'), ('order','PED'), ('sales_note','REM'), ('invoice','FAC')
  ) as dt(doc_type, prefix)
on conflict (organization_id, doc_type, serie) do nothing;


-- ============================================================================
-- B · COTIZACIONES (quotes + quote_items) — C1.2
-- ============================================================================
create table if not exists quotes (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  folio                text not null,                      -- next_serie_folio(org,'quote')
  customer_id          uuid references customers(id),
  status               quote_status not null default 'borrador',
  vigencia_dias        int  not null default 15,
  valid_until          date,                               -- created::date + vigencia_dias
  version              int  not null default 1,
  parent_quote_id      uuid references quotes(id),         -- versiones/duplicados
  descuento_global_pct numeric(5,2)  not null default 0,
  subtotal             numeric(14,2) not null default 0,
  tax                  numeric(14,2) not null default 0,
  total                numeric(14,2) not null default 0,
  notas                text,
  custom               jsonb not null default '{}'::jsonb,
  created_by           uuid references profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, folio)
);
create index if not exists idx_quotes_org_status on quotes(organization_id, status);
create index if not exists idx_quotes_org_created on quotes(organization_id, created_at desc);

create table if not exists quote_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  quote_id           uuid not null references quotes(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  sku                text,
  name               text not null,
  qty                numeric(14,3) not null check (qty > 0),
  unit_price         numeric(14,2) not null,
  discount_pct       numeric(5,2)  not null default 0,
  iva_rate           numeric(4,3)  not null default 0.160,
  line_total         numeric(14,2) not null            -- calculado en servidor (C1.8)
);
create index if not exists idx_quote_items_org on quote_items(organization_id);
create index if not exists idx_quote_items_quote on quote_items(quote_id);

drop trigger if exists trg_quotes_touch on quotes;
create trigger trg_quotes_touch before update on quotes
  for each row execute function app.touch_updated_at();


-- ============================================================================
-- C · PEDIDO — extensión de order_items + record_delivery + transition_order v3
-- ============================================================================

-- qty_delivered INTEGER (casa con order_items.qty INTEGER). Entrega = dato de
-- logística por partida; NO mueve inventario (el stock ya lo aplicó
-- transition_order en 'pagado').
alter table order_items add column if not exists qty_delivered integer not null default 0;

-- RPC de entrega: suma qty a qty_delivered (clamp a la qty pedida) y fija el
-- estado del pedido: 'surtido' si TODO está completo, 'surtido_parcial' si hay
-- mezcla. NO decrementa inventario. p_lines = [{"item_id":uuid,"qty":int}].
create or replace function public.record_delivery(
  p_order_id uuid,
  p_lines    jsonb
) returns orders
language plpgsql security definer set search_path = public, app as $$
declare
  v_order  orders;
  ln       jsonb;
  v_total  int;
  v_full   int;
  v_any    int;
  v_status order_status;
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order is null then raise exception 'order not found'; end if;
  perform app.assert_org(v_order.organization_id);

  if not app.has_perm('ordenes','editar') then
    raise exception 'forbidden: falta permiso ordenes/editar' using errcode = '42501';
  end if;
  if v_order.status = 'cancelada' then
    raise exception 'pedido cancelado: no admite entregas';
  end if;

  -- Aplica cada línea con clamp [0 .. qty pedida].
  for ln in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    update order_items
       set qty_delivered = greatest(0, least(qty, qty_delivered + (ln->>'qty')::int))
     where id = (ln->>'item_id')::uuid
       and order_id = p_order_id;
  end loop;

  -- Reevalúa el estado agregando sobre todas las partidas del pedido.
  select count(*),
         count(*) filter (where qty_delivered >= qty),
         count(*) filter (where qty_delivered > 0)
    into v_total, v_full, v_any
    from order_items where order_id = p_order_id;

  if v_total > 0 and v_full = v_total then
    v_status := 'surtido';
  elsif v_any > 0 then
    v_status := 'surtido_parcial';
  else
    v_status := v_order.status;   -- nada entregado ⇒ sin cambio
  end if;

  update orders set status = v_status, updated_at = now()
   where id = p_order_id returning * into v_order;

  perform app.log_audit('order', v_order.id::text, 'entrega',
    jsonb_build_object('lines', coalesce(p_lines,'[]'::jsonb), 'status', v_status),
    v_order.organization_id);

  return v_order;
end; $$;
grant execute on function public.record_delivery(uuid, jsonb) to authenticated, service_role;

-- transition_order v3: copia EXACTA de la v2 (0010) — cambia SOLO el array
-- pipeline para insertar 'surtido_parcial' como paso lineal (entre 'pagado' y
-- 'surtido') y no romper array_position. Un pedido 'surtido_parcial' puede
-- avanzar a 'facturado'/'enviado'. La aplicación de stock se mantiene idéntica.
create or replace function public.transition_order(
  p_order_id uuid,
  p_new      order_status
) returns orders
language plpgsql security definer set search_path = public, app as $$
declare
  v_order  orders;
  v_prev   order_status;
  v_idx    int;
  v_new    int;
  pipeline order_status[] := array['borrador','confirmado','pagado','surtido_parcial','surtido','facturado','enviado']::order_status[];
begin
  select * into v_order from orders where id = p_order_id for update;
  if v_order is null then raise exception 'order not found'; end if;
  perform app.assert_org(v_order.organization_id);
  v_prev := v_order.status;

  if not app.has_perm('ordenes','editar') then
    raise exception 'forbidden: falta permiso ordenes/editar' using errcode = '42501';
  end if;

  if p_new = 'cancelada' then
    if not app.has_perm('ordenes','cancelar') then
      raise exception 'forbidden: falta permiso ordenes/cancelar' using errcode = '42501';
    end if;
    if v_order.status in ('facturado','enviado') then
      raise exception 'no se puede cancelar un pedido %', v_order.status;
    end if;
    update orders set status = 'cancelada', updated_at = now() where id = p_order_id returning * into v_order;
    perform app.log_audit('order', v_order.id::text, 'transicion',
      jsonb_build_object('de', v_prev, 'a', p_new), v_order.organization_id);
    return v_order;
  end if;

  if v_order.status = 'cancelada' then
    raise exception 'pedido cancelado: transición no permitida';
  end if;

  select array_position(pipeline, v_order.status) into v_idx;
  select array_position(pipeline, p_new) into v_new;
  if v_new is null then raise exception 'estado destino inválido'; end if;
  if v_new < v_idx then raise exception 'no se permite retroceder de % a %', v_order.status, p_new; end if;

  -- Aplica stock al alcanzar pagado/surtido por primera vez (idempotente).
  if p_new in ('pagado','surtido','facturado','enviado') then
    perform app.apply_order_stock(p_order_id);
  end if;

  update orders set status = p_new, updated_at = now() where id = p_order_id returning * into v_order;
  perform app.log_audit('order', v_order.id::text, 'transicion',
    jsonb_build_object('de', v_prev, 'a', p_new), v_order.organization_id);
  return v_order;
end; $$;
grant execute on function public.transition_order(uuid, order_status) to authenticated, service_role;


-- ============================================================================
-- D · REMISIONES (sales_notes + sales_note_items) + cobrar_remision — C1.4
-- ============================================================================
create table if not exists sales_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  folio           text not null,                       -- next_serie_folio(org,'sales_note')
  customer_id     uuid references customers(id),       -- NULL = Público en general
  warehouse_id    uuid references warehouses(id),
  status          sales_note_status not null default 'abierta',
  subtotal        numeric(14,2) not null default 0,
  tax             numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  payment_method  text,                                -- 'efectivo'|'tarjeta'|'transferencia'
  paid_at         timestamptz,
  stock_applied   boolean not null default false,      -- evita doble decremento (patrón orders)
  cancel_reason   text,
  canceled_at     timestamptz,
  custom          jsonb not null default '{}'::jsonb,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, folio)
);
create index if not exists idx_sales_notes_org_status on sales_notes(organization_id, status);
create index if not exists idx_sales_notes_org_created on sales_notes(organization_id, created_at desc);

create table if not exists sales_note_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  sales_note_id      uuid not null references sales_notes(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  sku                text,
  name               text not null,
  qty                numeric(14,3) not null check (qty > 0),
  unit_price         numeric(14,2) not null,
  discount_pct       numeric(5,2)  not null default 0,
  iva_rate           numeric(4,3)  not null default 0.160,
  line_total         numeric(14,2) not null
);
create index if not exists idx_sni_org on sales_note_items(organization_id);
create index if not exists idx_sni_note on sales_note_items(sales_note_id);

drop trigger if exists trg_sales_notes_touch on sales_notes;
create trigger trg_sales_notes_touch before update on sales_notes
  for each row execute function app.touch_updated_at();

-- Cobra una remisión abierta: aplica stock UNA vez (patrón apply_order_stock,
-- idempotente vía stock_applied), la marca cobrada y registra el pago.
-- qty de sales_note_items es numeric ⇒ se castea con round(qty)::int para
-- adjust_inventory (que exige integer con signo).
create or replace function public.cobrar_remision(
  p_id     uuid,
  p_method text
) returns sales_notes
language plpgsql security definer set search_path = public, app as $$
declare
  v_note sales_notes;
  v_wh   uuid;
  it     record;
begin
  select * into v_note from sales_notes where id = p_id for update;
  if v_note is null then raise exception 'remisión no encontrada'; end if;
  perform app.assert_org(v_note.organization_id);

  if not app.has_perm('remisiones','editar') then
    raise exception 'forbidden: falta permiso remisiones/editar' using errcode = '42501';
  end if;
  if v_note.status <> 'abierta' then
    raise exception 'la remisión % no está abierta (estado %)', v_note.folio, v_note.status;
  end if;

  -- Aplica stock una sola vez (candado stock_applied, patrón apply_order_stock).
  if not v_note.stock_applied then
    v_wh := coalesce(
      v_note.warehouse_id,
      (select id from warehouses where organization_id = v_note.organization_id and is_default order by created_at limit 1),
      (select id from warehouses where organization_id = v_note.organization_id order by created_at limit 1)
    );
    for it in
      select product_variant_id, qty from sales_note_items
       where sales_note_id = p_id and product_variant_id is not null
    loop
      perform public.adjust_inventory(
        it.product_variant_id, v_wh, -(round(it.qty))::int, 'salida',
        'Remisión ' || v_note.folio, 'sales_note', v_note.id
      );
    end loop;
  end if;

  update sales_notes
     set stock_applied  = true,
         status         = 'cobrada',
         paid_at        = now(),
         payment_method = p_method,
         updated_at     = now()
   where id = p_id returning * into v_note;

  perform app.log_audit('sales_note', v_note.id::text, 'cobrar',
    jsonb_build_object('metodo', p_method, 'total', v_note.total), v_note.organization_id);

  return v_note;
end; $$;
grant execute on function public.cobrar_remision(uuid, text) to authenticated, service_role;


-- ============================================================================
-- E · FACTURA — extensión + partidas + pagos/CxC/REP + global + catálogos SAT
-- ============================================================================

-- Extensión de invoices (metodo/forma de pago, saldo, updated_at + trigger).
alter table invoices
  add column if not exists metodo_pago text default 'PUE',
  add column if not exists forma_pago  text,
  add column if not exists saldo       numeric(14,2),
  add column if not exists updated_at  timestamptz not null default now();

do $$ begin
  alter table invoices add constraint invoices_metodo_pago_check
    check (metodo_pago in ('PUE','PPD'));
exception when duplicate_object then null;
end $$;

drop trigger if exists trg_invoices_touch on invoices;
create trigger trg_invoices_touch before update on invoices
  for each row execute function app.touch_updated_at();

-- NUEVA tabla de partidas de factura (invoices no tenía partidas; se necesitan
-- para CFDI/PDF/global). Misma forma de partida que quote_items.
create table if not exists invoice_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  invoice_id         uuid not null references invoices(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  sku                text,
  name               text not null,
  qty                numeric(14,3) not null check (qty > 0),
  unit_price         numeric(14,2) not null,
  discount_pct       numeric(5,2)  not null default 0,
  iva_rate           numeric(4,3)  not null default 0.160,
  line_total         numeric(14,2) not null
);
create index if not exists idx_invoice_items_org on invoice_items(organization_id);
create index if not exists idx_invoice_items_inv on invoice_items(invoice_id);

-- Pagos de factura (CxC + base del REP / complemento de pago).
create table if not exists invoice_payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id      uuid not null references invoices(id) on delete cascade,
  fecha           date not null default current_date,
  monto           numeric(14,2) not null check (monto > 0),
  forma_pago      text not null,
  is_rep          boolean not null default false,      -- PPD ⇒ genera complemento
  uuid_rep        text,                                -- UUID del REP timbrado (mock)
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_invoice_payments_org on invoice_payments(organization_id);
create index if not exists idx_invoice_payments_inv on invoice_payments(invoice_id);

-- Factura global: N remisiones → 1 factura. Candado unique(sales_note_id): una
-- remisión no puede estar en más de una factura. (Se agrega organization_id vs
-- C1.5 para poder aplicar el patrón RLS org-match idéntico al de 0010.)
create table if not exists invoice_sales_notes (
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id      uuid not null references invoices(id) on delete cascade,
  sales_note_id   uuid not null references sales_notes(id) on delete cascade,
  primary key (invoice_id, sales_note_id),
  unique (sales_note_id)
);
create index if not exists idx_isn_org on invoice_sales_notes(organization_id);
create index if not exists idx_isn_note on invoice_sales_notes(sales_note_id);

-- Registra un pago de factura, recalcula el saldo y ajusta el estado.
-- status debe estar en ('timbrada','pago_parcial'). is_rep = PPD.
create or replace function public.registrar_pago_factura(
  p_invoice  uuid,
  p_monto    numeric,
  p_forma    text,
  p_uuid_rep text default null
) returns invoices
language plpgsql security definer set search_path = public, app as $$
declare
  v_inv    invoices;
  v_pagado numeric(14,2);
  v_saldo  numeric(14,2);
  v_status invoice_status;
begin
  select * into v_inv from invoices where id = p_invoice for update;
  if v_inv is null then raise exception 'factura no encontrada'; end if;
  perform app.assert_org(v_inv.organization_id);

  if not app.has_perm('facturacion','editar') then
    raise exception 'forbidden: falta permiso facturacion/editar' using errcode = '42501';
  end if;
  if v_inv.status not in ('timbrada','pago_parcial') then
    raise exception 'la factura % no admite pagos (estado %)', v_inv.folio, v_inv.status;
  end if;

  insert into invoice_payments
    (organization_id, invoice_id, monto, forma_pago, is_rep, uuid_rep, created_by)
  values
    (v_inv.organization_id, p_invoice, p_monto, p_forma,
     (v_inv.metodo_pago = 'PPD'), p_uuid_rep, auth.uid());

  select coalesce(sum(monto), 0) into v_pagado
    from invoice_payments where invoice_id = p_invoice;
  v_saldo := v_inv.total - v_pagado;

  if v_saldo <= 0 then
    v_status := 'pagada';
  else
    v_status := 'pago_parcial';
  end if;

  update invoices set saldo = v_saldo, status = v_status, updated_at = now()
   where id = p_invoice returning * into v_inv;

  perform app.log_audit('invoice', v_inv.id::text, 'pago',
    jsonb_build_object('monto', p_monto, 'forma', p_forma, 'saldo', v_saldo, 'status', v_status),
    v_inv.organization_id);

  return v_inv;
end; $$;
grant execute on function public.registrar_pago_factura(uuid, numeric, text, text) to authenticated, service_role;

-- Catálogos SAT nuevos (patrón sat_* de 0010: read-all + super write).
create table if not exists sat_forma_pago (
  code  text primary key,
  label text not null
);
create table if not exists sat_metodo_pago (
  code  text primary key,
  label text not null
);

insert into sat_forma_pago (code, label) values
  ('01','Efectivo'),
  ('02','Cheque nominativo'),
  ('03','Transferencia electrónica'),
  ('04','Tarjeta de crédito'),
  ('28','Tarjeta de débito'),
  ('99','Por definir')
on conflict (code) do nothing;

insert into sat_metodo_pago (code, label) values
  ('PUE','Pago en una exhibición'),
  ('PPD','Pago en parcialidades o diferido')
on conflict (code) do nothing;

alter table sat_forma_pago  enable row level security;
alter table sat_metodo_pago enable row level security;

drop policy if exists sat_forma_pago_read on sat_forma_pago;
create policy sat_forma_pago_read on sat_forma_pago
  for select to authenticated using ( true );
drop policy if exists sat_forma_pago_super_write on sat_forma_pago;
create policy sat_forma_pago_super_write on sat_forma_pago
  for all to authenticated
  using ( app.is_super_admin() ) with check ( app.is_super_admin() );

drop policy if exists sat_metodo_pago_read on sat_metodo_pago;
create policy sat_metodo_pago_read on sat_metodo_pago
  for select to authenticated using ( true );
drop policy if exists sat_metodo_pago_super_write on sat_metodo_pago;
create policy sat_metodo_pago_super_write on sat_metodo_pago
  for all to authenticated
  using ( app.is_super_admin() ) with check ( app.is_super_admin() );


-- ============================================================================
-- F · DOCUMENT FLOW (document_links) + helper link_docs — C1.6
-- ============================================================================
create table if not exists document_links (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  src_type        text not null,      -- 'quote'|'order'|'sales_note'|'invoice'
  src_id          uuid not null,
  dst_type        text not null,
  dst_id          uuid not null,
  created_at      timestamptz not null default now(),
  unique (src_type, src_id, dst_type, dst_id)
);
create index if not exists idx_doclinks_src on document_links(organization_id, src_type, src_id);
create index if not exists idx_doclinks_dst on document_links(organization_id, dst_type, dst_id);

-- Helper transversal: resuelve la org vía current_org_id e inserta el enlace
-- (idempotente). SECURITY DEFINER ⇒ bypassa RLS.
create or replace function app.link_docs(
  p_src_type text, p_src_id uuid, p_dst_type text, p_dst_id uuid
) returns void
language plpgsql security definer set search_path = public, app as $$
declare
  v_org uuid := app.current_org_id();
begin
  if v_org is null then raise exception 'sin organización de contexto'; end if;
  insert into document_links (organization_id, src_type, src_id, dst_type, dst_id)
  values (v_org, p_src_type, p_src_id, p_dst_type, p_dst_id)
  on conflict (src_type, src_id, dst_type, dst_id) do nothing;
end; $$;

create or replace function public.link_docs(
  p_src_type text, p_src_id uuid, p_dst_type text, p_dst_id uuid
) returns void
language sql security definer set search_path = public, app as $$
  select app.link_docs(p_src_type, p_src_id, p_dst_type, p_dst_id);
$$;
grant execute on function public.link_docs(text, uuid, text, uuid) to authenticated, service_role;


-- ============================================================================
-- G · MÓDULOS + RBAC + RLS de las tablas nuevas
-- ============================================================================

-- Registro de los 2 módulos nuevos (core=false; sort 10/11).
insert into modules (id, key, name, icon, route_prefix, core, sort) values
  ('c0000000-0000-0000-0000-00000000000a','cotizaciones','Cotizaciones',
   'M7 3h8l3 3v15H7V3zM9 8h6M9 11h6M9 14h4','cotizaciones',false,10),
  ('c0000000-0000-0000-0000-00000000000b','remisiones','Remisiones',
   'M5 4h11l3 3v13H5V4zM8 9h8M8 12h8M8 15h5','remisiones',false,11)
on conflict (key) do nothing;

-- Agrega los 2 módulos a los default_modules de la vertical inventario_pesado
-- (guard idempotente).
update verticals
   set default_modules = default_modules || '["cotizaciones","remisiones"]'::jsonb
 where key = 'inventario_pesado'
   and not default_modules @> '["cotizaciones"]'::jsonb;

-- Activa ambos módulos en los tenants existentes de esa vertical.
insert into organization_modules (organization_id, module_id, enabled)
select o.id, m.id, true
  from organizations o
  join verticals v on v.id = o.vertical_id and v.key = 'inventario_pesado'
  cross join modules m
 where m.key in ('cotizaciones','remisiones')
on conflict (organization_id, module_id) do nothing;

-- Seed de defaults globales de role_permissions (organization_id NULL) para los
-- 2 módulos nuevos × 3 roles × 5 acciones (misma lógica que 0010).
insert into role_permissions (organization_id, role, module_key, action, allowed)
select
  null, r.role, m.module_key, a.action,
  case
    when r.role = 'tenant_admin' then true
    when r.role = 'tenant_user'  then a.action in ('ver','crear','editar')
    else a.action = 'ver'   -- tenant_viewer
  end
from unnest(array['tenant_admin','tenant_user','tenant_viewer']::user_role[]) as r(role)
cross join unnest(array['cotizaciones','remisiones']) as m(module_key)
cross join unnest(array['ver','crear','editar','cancelar','configurar']) as a(action)
on conflict do nothing;

-- RLS por operación (patrón idéntico a 0010) para las tablas gateadas por módulo.
-- Se habilita RLS y se crean 4 policies (select/insert/update/delete) por tabla.
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('quotes',              'cotizaciones'),
      ('quote_items',         'cotizaciones'),
      ('sales_notes',         'remisiones'),
      ('sales_note_items',    'remisiones'),
      ('invoice_items',       'facturacion'),
      ('invoice_payments',    'facturacion'),
      ('invoice_sales_notes', 'facturacion')
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

-- org_series: SELECT org-match; INSERT/UPDATE org-match + config/configurar;
-- DELETE super_admin. (La numeración normal va por next_serie_folio, SECURITY
-- DEFINER, que bypassa RLS; esto sólo gobierna acceso directo a la tabla.)
alter table org_series enable row level security;
drop policy if exists org_series_select on org_series;
create policy org_series_select on org_series
  for select to authenticated
  using ( app.is_super_admin() or organization_id = app.current_org_id() );
drop policy if exists org_series_insert on org_series;
create policy org_series_insert on org_series
  for insert to authenticated
  with check (
    (app.is_super_admin() or organization_id = app.current_org_id())
    and app.has_perm('config','configurar')
  );
drop policy if exists org_series_update on org_series;
create policy org_series_update on org_series
  for update to authenticated
  using (
    (app.is_super_admin() or organization_id = app.current_org_id())
    and app.has_perm('config','configurar')
  )
  with check ( app.is_super_admin() or organization_id = app.current_org_id() );
drop policy if exists org_series_delete on org_series;
create policy org_series_delete on org_series
  for delete to authenticated using ( app.is_super_admin() );

-- document_links: transversal — SELECT/INSERT org-match (sin gating de módulo);
-- DELETE super_admin.
alter table document_links enable row level security;
drop policy if exists document_links_select on document_links;
create policy document_links_select on document_links
  for select to authenticated
  using ( app.is_super_admin() or organization_id = app.current_org_id() );
drop policy if exists document_links_insert on document_links;
create policy document_links_insert on document_links
  for insert to authenticated
  with check ( app.is_super_admin() or organization_id = app.current_org_id() );
drop policy if exists document_links_delete on document_links;
create policy document_links_delete on document_links
  for delete to authenticated using ( app.is_super_admin() );


-- ============================================================================
-- H · Grants base (idéntico al bloque de 0010 — idempotente y seguro).
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
-- -- G) RLS + módulos + permisos
-- do $$ declare t text; begin
--   foreach t in array array['quotes','quote_items','sales_notes',
--     'sales_note_items','invoice_items','invoice_payments','invoice_sales_notes'] loop
--     execute format('drop policy if exists %I on %I;', t || '_select', t);
--     execute format('drop policy if exists %I on %I;', t || '_insert', t);
--     execute format('drop policy if exists %I on %I;', t || '_update', t);
--     execute format('drop policy if exists %I on %I;', t || '_delete', t);
--   end loop;
-- end $$;
-- delete from role_permissions where organization_id is null and module_key in ('cotizaciones','remisiones');
-- delete from organization_modules where module_id in
--   ('c0000000-0000-0000-0000-00000000000a','c0000000-0000-0000-0000-00000000000b');
-- update verticals set default_modules = default_modules - 'cotizaciones' - 'remisiones' where key='inventario_pesado';
-- delete from modules where key in ('cotizaciones','remisiones');
--
-- -- F) document flow
-- drop function if exists public.link_docs(text, uuid, text, uuid);
-- drop function if exists app.link_docs(text, uuid, text, uuid);
-- drop table if exists document_links;
--
-- -- E) factura
-- drop function if exists public.registrar_pago_factura(uuid, numeric, text, text);
-- drop table if exists sat_metodo_pago;
-- drop table if exists sat_forma_pago;
-- drop table if exists invoice_sales_notes;
-- drop table if exists invoice_payments;
-- drop table if exists invoice_items;
-- drop trigger if exists trg_invoices_touch on invoices;
-- alter table invoices drop constraint if exists invoices_metodo_pago_check;
-- alter table invoices drop column if exists updated_at, drop column if exists saldo,
--   drop column if exists forma_pago, drop column if exists metodo_pago;
--
-- -- D) remisiones
-- drop function if exists public.cobrar_remision(uuid, text);
-- drop table if exists sales_note_items;
-- drop table if exists sales_notes;
--
-- -- C) pedido (restaurar transition_order v2 de 0010; ver ese archivo)
-- drop function if exists public.record_delivery(uuid, jsonb);
-- alter table order_items drop column if exists qty_delivered;
--
-- -- B) cotizaciones
-- drop table if exists quote_items;
-- drop table if exists quotes;
--
-- -- A) series
-- drop function if exists public.next_serie_folio(uuid, text, text);
-- drop function if exists app.next_serie_folio(uuid, text, text);
-- drop table if exists org_series;
-- ============================================================================
