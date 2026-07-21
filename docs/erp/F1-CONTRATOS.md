# FASE 1 — Ventas (quote-to-cash) · Contratos (fuente de verdad)

> Los subagentes CONSUMEN estos contratos; ninguno los modifica. Si un contrato
> está mal, se reporta al orquestador, que lo corrige y relanza a los afectados.
> Convenciones F0 vigentes: `organization_id`, español en enums/datos/UI,
> migraciones `NNNN_nombre.sql` con `-- ROLLBACK:`, RLS por operación con
> `app.has_perm(modulo,accion)` + `app.org_has_module(modulo)`, auditoría vía
> `app.log_audit`, guards `requireModule`/`requirePerm`, endpoints paginados en
> `/api/erp/*`, panel React en `/app/panel`, tipos en `src/lib/types/erp.ts`.

## Decisiones ratificadas (Jesús)
1. **Pedido**: se CONSERVA `orders` + su pipeline y `transition_order` (Stripe/CFDI/stock intactos). Entregas parciales = DATO por partida (`order_items.qty_delivered`) + estado `surtido_parcial` gestionado por una RPC de entrega separada, NO por el pipeline lineal.
2. **PDF**: vista imprimible HTML/CSS (`@media print`) con branding del tenant. CERO librerías nuevas.
3. **Correo**: interfaz `EmailProvider` + `MockEmailProvider` (patrón `PacProvider`). Sin proveedor real.

Módulos nuevos: `cotizaciones`, `remisiones` (+ los existentes `ordenes`, `facturacion`). Se registran en `modules` y en los `default_modules` de la vertical `inventario_pesado`. Flag por tenant `ventas.remisiones_enabled` (via `organization_modules.config`).

---

## C1 · Esquema BD (AGENTE-DB — migraciones 0011 y 0012)

Regla PG: los `ALTER TYPE ... ADD VALUE` van en `0011_f1_enums.sql` (su propia tx); todo lo demás en `0012_f1_ventas.sql`.

### C1.0 · Enums (0011)
- `invoice_status` += `'pagada'`, `'pago_parcial'`.
- `order_status` += `'surtido_parcial'`.
- Nuevos: `quote_status` enum ('borrador','enviada','aceptada','rechazada','vencida'); `sales_note_status` enum ('abierta','cobrada','facturada','cancelada').

### C1.1 · Series de folios (`org_series`) — extiende `org_counters`
```sql
create table org_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  doc_type text not null,     -- 'quote','order','sales_note','invoice'
  serie text not null default 'A',
  prefix text not null,       -- 'COT','PED','REM','FAC'
  next_value int not null default 1,
  is_default boolean not null default true,
  unique (organization_id, doc_type, serie)
);
```
- RPC `public.next_serie_folio(p_org uuid, p_doc_type text, p_serie text default null) → text`
  SECURITY DEFINER, atómica (`UPDATE ... RETURNING` sobre la fila con `FOR UPDATE`; si no hay fila crea con prefix por defecto por doc_type). Devuelve **`"PREFIX-SERIE-0001"`** (folio formateado, 4 dígitos con padding). Reusa el estilo de `next_folio`. Grant execute a authenticated+service_role.
- Seed en 0012: una fila `org_series` por cada (org, doc_type) para todos los tenants existentes, con prefijos COT/PED/REM/FAC, serie 'A', next_value=1 (excepto invoice, que arranca donde va el seed actual).

### C1.2 · Cotizaciones (`quotes` + `quote_items`)
```sql
create table quotes (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  folio text not null,                       -- next_serie_folio(org,'quote')
  customer_id uuid references customers(id),
  status quote_status not null default 'borrador',
  vigencia_dias int not null default 15,
  valid_until date,                          -- created::date + vigencia_dias
  version int not null default 1,
  parent_quote_id uuid references quotes(id),-- versiones/duplicados
  descuento_global_pct numeric(5,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notas text,
  custom jsonb not null default '{}',        -- flexfields F0
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, folio)
);
create table quote_items (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  quote_id uuid not null references quotes(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  sku text, name text not null,
  qty numeric(14,3) not null check (qty > 0),
  unit_price numeric(14,2) not null,
  discount_pct numeric(5,2) not null default 0,
  iva_rate numeric(4,3) not null default 0.160,
  line_total numeric(14,2) not null           -- calculado en servidor
);
```
Módulo RLS: `cotizaciones`. Trigger touch_updated_at en quotes.

### C1.3 · Pedido — extensión de `orders`/`order_items`
```sql
alter table order_items add column qty_delivered numeric(14,3) not null default 0;
```
- RPC `public.record_delivery(p_order_id uuid, p_lines jsonb) → orders`
  (p_lines = `[{"item_id":uuid,"qty":number}]`). SECURITY DEFINER. Valida `app.has_perm('ordenes','editar')`; suma qty a `order_items.qty_delivered` (sin exceder qty pedida); si TODAS las líneas quedan completas ⇒ status='surtido', si algunas parciales ⇒ 'surtido_parcial'; registra `app.log_audit`. NO decrementa inventario aquí (eso ya lo hace `transition_order`→'surtido' en F0; en F1 la entrega es de logística, no de stock — documentar).
- `transition_order` (F0) queda IGUAL; `surtido_parcial` es un estado lateral fijado por `record_delivery`, no parte del array lineal. Un pedido en 'surtido_parcial' puede avanzar a 'facturado'/'enviado' vía transition_order (agregar 'surtido_parcial' al array entre 'surtido' y 'facturado' para que `array_position` no rompa; documentar el ajuste).

### C1.4 · Remisiones (`sales_notes` + `sales_note_items`)
```sql
create table sales_notes (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  folio text not null,                        -- next_serie_folio(org,'sales_note')
  customer_id uuid references customers(id),  -- NULL = Público en general
  warehouse_id uuid references warehouses(id),
  status sales_note_status not null default 'abierta',
  subtotal/tax/total numeric(14,2) not null default 0,
  payment_method text,                        -- 'efectivo','tarjeta','transferencia'
  paid_at timestamptz,
  stock_applied boolean not null default false,-- evita doble decremento (patrón orders)
  cancel_reason text, canceled_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, folio)
);
create table sales_note_items ( ...igual forma que quote_items, FK sales_note_id... );
```
- RPC `public.cobrar_remision(p_id uuid, p_method text) → sales_notes`: valida permiso `ventas`/'editar' (módulo `remisiones`); status abierta→cobrada; aplica stock UNA vez (patrón `apply_order_stock`, razón "Remisión <folio>") con `stock_applied`; setea paid_at/payment_method; audita.
- Módulo RLS: `remisiones`. Corte del día = query de sales_notes cobradas por método/fecha (endpoint, no tabla).

### C1.5 · Factura — extensión de `invoices` + pagos/CxC/REP + global
```sql
alter table invoices
  add column metodo_pago text default 'PUE' check (metodo_pago in ('PUE','PPD')),
  add column forma_pago text,                 -- SAT c_FormaPago ('01','03','99'...)
  add column saldo numeric(14,2);             -- total - sum(pagos); trigger o cálculo
create table invoice_payments (              -- CxC + base de REP
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  invoice_id uuid not null references invoices(id),
  fecha date not null default current_date,
  monto numeric(14,2) not null check (monto > 0),
  forma_pago text not null,
  is_rep boolean not null default false,      -- PPD ⇒ genera complemento de pago
  uuid_rep text,                              -- UUID del REP timbrado (mock)
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create table invoice_sales_notes (           -- factura global N remisiones → 1 factura
  invoice_id uuid not null references invoices(id),
  sales_note_id uuid not null references sales_notes(id),
  primary key (invoice_id, sales_note_id),
  unique (sales_note_id)                       -- CANDADO: una remisión en 1 sola factura
);
```
- Nuevos catálogos SAT: `sat_forma_pago` (01 Efectivo, 02 Cheque, 03 Transferencia, 04 Tarjeta crédito, 28 Tarjeta débito, 99 Por definir), `sat_metodo_pago` (PUE, PPD). Patrón de los `sat_*` de F0.
- RPC `public.registrar_pago_factura(p_invoice uuid, p_monto numeric, p_forma text) → invoices`: inserta invoice_payment; recalcula saldo; status → 'pago_parcial' (saldo>0) o 'pagada' (saldo=0); si metodo_pago='PPD' marca `is_rep=true` y timbra REP via PacProvider (mock); audita.
- `document_links` (C1.6) liga quote→order→invoice y sales_note→invoice.

### C1.6 · Document flow (`document_links`)
```sql
create table document_links (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  src_type text not null, src_id uuid not null,  -- 'quote'|'order'|'sales_note'|'invoice'
  dst_type text not null, dst_id uuid not null,
  created_at timestamptz not null default now(),
  unique (src_type, src_id, dst_type, dst_id)
);
create index on document_links (organization_id, src_type, src_id);
create index on document_links (organization_id, dst_type, dst_id);
```
RLS: SELECT/INSERT org-match (sin gating de módulo — es transversal); DELETE super_admin. Helper `app.link_docs(src_type,src_id,dst_type,dst_id)`.

### C1.7 · RLS y grants
Cada tabla nueva: RLS por operación con su módulo (quotes→'cotizaciones', sales_notes→'remisiones', invoice_payments/invoice_sales_notes→'facturacion', order_items ya existe). `document_links` transversal. Los grants base (F0 0010) ya cubren tablas futuras vía `alter default privileges`, pero 0012 debe re-`grant all on all tables ... to anon, authenticated, service_role` por si acaso. Registrar módulos `cotizaciones`/`remisiones` en `modules` + agregarlos a `verticals.default_modules` de inventario_pesado + activarlos en tenants existentes de esa vertical.

### C1.8 · Fórmula de totales (servidor, en RPCs y endpoints)
Por línea: `line_total = round(qty * unit_price * (1 - discount_pct/100), 2)`.
`subtotal = sum(line_total)`. Aplicar `descuento_global_pct` sobre subtotal.
`tax = sum(round(line_base * iva_rate, 2))` con `line_base = line_total` tras descuento global prorrateado. `total = subtotal - descuento_global + tax`. Documentar exacto en el código; los tests QA validan con descuentos por partida y global.

## C2 · Tipos TS compartidos (`src/lib/types/erp-ventas.ts` — ORQUESTADOR)
`DocLine` (partida compartida), `QuoteRow`/`QuoteDetail`, `SalesNoteRow`, `InvoiceRow`/`InvoicePaymentRow`, `DocumentLink`, `SeriesRow`, enums TS espejo. Nadie más los edita.

## C3 · Piezas compartidas (las construye el ORQUESTADOR en una mini-tanda antes de Tanda B; los 4 agentes las consumen sin modificarlas)
- `src/lib/erp/documents.ts`: cálculo de totales (C1.8), `linkDocs`, `fetchDocumentFlow(type,id)` (cadena completa bidireccional).
- `src/lib/erp/folios.ts`: wrapper de `next_serie_folio`.
- `src/lib/pac/`: extender `PacProvider` con `timbrarREP(pago)` + stub.
- `src/lib/email/`: `EmailProvider` + `MockEmailProvider` (registra en tabla o log; devuelve id).
- `src/app/panel/_components/DocLinesEditor.tsx`: editor de partidas (buscar producto/variante, qty, precio desde lista del cliente vía `resolveVariantPrice`, descuento, totales en vivo).
- `src/app/panel/_components/CustomerPicker.tsx`, `ProductPicker.tsx`.
- `src/app/panel/print/`: layout imprimible base con branding del tenant (logo/color de `organizations`).
- `src/app/panel/_components/DocumentFlow.tsx`: visualización de la cadena.

## C4 · Endpoints y páginas por submódulo (Tanda B — 4 agentes, propiedad exclusiva por submódulo)
Todos: `requireModule`+`requirePerm`+Zod+paginación; document_links en las conversiones; totales en servidor.
- **AGENTE-COTIZACIONES**: `src/app/api/erp/quotes/**` (CRUD, enviar[mock email], aceptar/rechazar, duplicar/versionar, PDF-print) + `src/app/panel/cotizaciones/**`. Convertir a pedido = link + copia de partidas (la costura la cierra el orquestador en Tanda C).
- **AGENTE-PEDIDOS**: `src/app/api/erp/orders/**` (nuevo namespace erp: listar/detalle/crear/transicionar/entregar; NO toca el `/api/orders` viejo del panel dc) + `src/app/panel/pedidos/**` + vista document flow.
- **AGENTE-REMISIONES**: `src/app/api/erp/sales-notes/**` (CRUD, cobrar, cancelar, corte del día, PDF) + `src/app/panel/remisiones/**` (venta mostrador rápida).
- **AGENTE-FACTURACION**: `src/app/api/erp/invoices/**` (crear desde pedido/remisión/global, timbrar[mock], registrar pago, REP, CxC) + `src/app/panel/facturacion/**` + reporte CxC (antigüedad).

## C5 · Mapa de propiedad de archivos
| Quién | Posee | Prohibido |
|---|---|---|
| AGENTE-DB (Tanda A) | `supabase/migrations/0011_*`,`0012_*`, `supabase/tests/f1_*.sql`, regen `database.types.ts` | resto |
| ORQUESTADOR (mini-tanda C3 + integración) | `src/lib/types/erp-ventas.ts`, `src/lib/erp/documents.ts`+`folios.ts`, `src/lib/pac/*` (REP), `src/lib/email/*`, los `_components` compartidos y `panel/print/*`, costuras de conversión, git | — |
| AGENTE-COTIZACIONES | `src/app/api/erp/quotes/**`, `src/app/panel/cotizaciones/**` | otros submódulos, lib compartida, migraciones |
| AGENTE-PEDIDOS | `src/app/api/erp/orders/**`, `src/app/panel/pedidos/**` | idem |
| AGENTE-REMISIONES | `src/app/api/erp/sales-notes/**`, `src/app/panel/remisiones/**` | idem |
| AGENTE-FACTURACION | `src/app/api/erp/invoices/**`, `src/app/panel/facturacion/**` | idem |
| AGENTE-QA-SEEDS | `supabase/seed.sql` (extensión F1), `scripts/qa/f1_*.sh` | migraciones, src |

## C6 · Criterios de aceptación F1 (orquestador en Tanda C)
- [ ] Flujo demo completo: cotización→aceptar→pedido→entrega(parcial+total)→factura→pago, con **document flow navegable en ambos sentidos**.
- [ ] Folios consecutivos por serie bajo creación concurrente (sin huecos/dups).
- [ ] Cancelar factura/remisión exige motivo y NO borra (soft, auditado).
- [ ] Totales e IVA calculados en servidor coinciden con UI (con descuentos por partida y global).
- [ ] Mostrador: remisión→cobro→decremento de inventario→conversión a factura sin duplicar movimientos ni ingreso.
- [ ] Remisión incluida en **factura global** no puede facturarse individualmente (candado) y viceversa.
- [ ] Corte del día cuadra vs remisiones cobradas por forma de pago.
- [ ] Tenant sin submódulo `facturacion` puede cotizar/pedir/remisionar pero NO facturar (403 + RLS).
- [ ] Factura PPD registra pago → genera REP (mock) → status pagada/pago_parcial; CxC con antigüedad 0-30/31-60/61-90/+90.
- [ ] `tsc`/`lint`/`build`/`vitest`/`supabase test db` verdes; panel dc viejo sin regresiones.
