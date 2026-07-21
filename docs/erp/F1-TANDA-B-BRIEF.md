# F1 · Tanda B — Brief compartido para los 4 agentes de submódulo

> Contrato operativo COMÚN a AGENTE-COTIZACIONES ∥ AGENTE-PEDIDOS ∥
> AGENTE-REMISIONES ∥ AGENTE-FACTURACIÓN. Cada uno construye SOLO su submódulo.

## Reglas duras
- Trabajas EXCLUSIVAMENTE en `~/APLIKA-AI`. NUNCA referencies otros proyectos (Reservi).
- NO haces `git` (ni pull ni commit). NO creas ni editas migraciones. NO corres `supabase db reset`.
- **PROHIBIDO editar (compartido, ya construido):** todo `src/lib/**`, `supabase/**`, `src/app/panel/_components/**`, `src/app/panel/_lib/api.ts`, `src/app/panel/_lib/ventas-api.ts`, `src/app/panel/_lib/hooks.ts`, `src/app/panel/panel.css`, `src/app/panel/layout.tsx`, `src/app/panel/print/**`, `src/app/panel/_components/PanelShell.tsx`/`Sidebar.tsx`, los archivos de OTROS submódulos, y los `/api/*` viejos del panel dc. Si crees necesitar tocar algo compartido, DETENTE y repórtalo — no lo edites.
- Solo creas archivos NUEVOS en: `src/app/api/erp/<tu-namespace>/**`, `src/app/panel/<tu-ruta>/**`, y un cliente nuevo `src/app/panel/_lib/<tu-submodulo>.ts`. Componentes propios del submódulo van en `src/app/panel/<tu-ruta>/_components/`.
- Las CONVERSIONES entre documentos (cotización→pedido, pedido→factura, remisión→factura, factura global) las hace el ORQUESTADOR en la Tanda C. Tú construyes SOLO acciones dentro de tu propio documento. NO llames a `linkDocs` ni crees documentos de otro submódulo.

## Superficie compartida (léela antes de escribir)
Plantillas a imitar: **`src/app/api/erp/customers/route.ts`** (backend) y **`src/app/panel/clientes/page.tsx`** (UI).

**Tipos:** `@/lib/types/erp-ventas` (`DocLine`, `DocLineInput`, `DocTotals`, `DocType`, `QuoteRow/QuoteDetail`, `OrderRow/OrderDetail`, `SalesNoteRow/SalesNoteDetail`, `InvoiceRow/InvoiceDetail`, `InvoicePaymentRow`, `CxcRow`, `CorteDelDiaRow`, `DeliveryLineInput`, `VariantPick`) y `@/lib/types/erp` (`SessionInfo`, `Paginated`, `ListParams`).

**Backend:**
- `@/lib/api` → `handle`, `ok`, `ApiError`
- `@/lib/erp/session` → `getErpSession()`
- `@/lib/erp/guards` → `requireAccess(session, modulo, accion)`
- `@/lib/erp/db` → `erpClientFor(session)`
- `@/lib/erp/pagination` → `parseListParams(url)`, `rangeFor(page,pageSize)`, `paginated(rows,page,pageSize,count)`
- `@/lib/erp/documents` → `buildLines(supabase, customerId, inputs)` (normaliza partidas: resuelve sku/nombre/iva/precio y calcula lineTotal), `computeTotals(lines, descuentoGlobalPct)` (→ `{subtotal, descuento, tax, total}`), `lineTotalOf`, `round2`, `fetchDocumentFlow`. **NO uses `linkDocs` (es de Tanda C).**
- `@/lib/erp/folios` → `nextSerieFolio(supabase, orgId, docType, serie?)` → folio formateado (`"COT-A-0001"`, `"PED-A-0001"`, `"REM-A-0001"`)
- `@/lib/erp/catalogs` → `fetchVentasCatalogs(supabase)` (forma/método de pago SAT)
- `@/lib/pac` → `getPacProvider()` con `.timbrar(cfdiInput)`, `.cancelar(uuid, motivo?)`, `.timbrarREP(repInput)`
- `@/lib/email` → `getEmailProvider()` con `.send({to, subject, html, docType?, docId?})`
- `@/lib/supabase/database.types` → `Tables<'x'>`, `TablesInsert<'x'>`, `TablesUpdate<'x'>`

**RPCs ya tipadas (supabase.rpc):** `record_delivery(p_order_id, p_lines)`, `cobrar_remision(p_id, p_method)`, `registrar_pago_factura(p_invoice, p_monto, p_forma, p_uuid_rep?)`, `transition_order(p_order_id, p_new)`, `next_folio(p_org, p_entity)`.

**Panel (cliente/UI):**
- `@/app/panel/_lib/ventas-api` → `searchVariants(search, customerId?)`, `getVentasCatalogs()`, `getDocumentFlow(type, id)`
- `@/app/panel/_lib/hooks` → `useAsyncData`, `usePaginated`
- `@/app/panel/_components/session` → `useSession()`, `useCan()`
- Componentes: `CustomerPicker` (`{value, onChange, allowPublico?}`), `ProductPicker` (`{customerId, onPick}`), `DocLinesEditor` (`{customerId, lines, onChange, descuentoGlobalPct?, onDescuentoGlobalChange?, readOnly?, showDelivered?, deliveredByIndex?}`), `DocumentFlow` (`{type, id}`), `PrintDocument` (`{doc: PrintableDoc}`), `DataTable`, `Drawer`, `Field` (TextField/NumberField/SelectField/CheckboxField), `States` (Badge/Spinner/EmptyState/ErrorState/ReadOnlyBadge), `Icon`.
- Rutas `/panel/**/print` ya se renderizan SIN sidebar (lo detecta PanelShell) y `print.css` es global. Tu página de impresión monta `<PrintDocument doc={...}>` con `orgName` de `useSession().organization`.

## Convenciones
- Route: `export const dynamic = 'force-dynamic'`; handler en `handle`; guard `requireAccess(session, '<modulo>', '<accion>')`; validación `zod`; listados paginados con `{count:'exact'}`; filas mapeadas a **camelCase**.
- **Totales SIEMPRE en servidor**: `const lines = await buildLines(supabase, customerId, inputs); const totals = computeTotals(lines, descPct);` Inserta partidas con `lines` (sku, name, unit_price, discount_pct, iva_rate, line_total) y cabecera con `totals` (subtotal, tax, total; el % de descuento global solo donde exista la columna, hoy solo `quotes.descuento_global_pct`).
- Folios: `await nextSerieFolio(supabase, session.organization!.id, '<docType>')`.
- Cancelar/rechazar = soft (estado + motivo), NUNCA `delete`.
- UI: `'use client'`; permisos con `useCan()`; moneda `new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'})`; español en todo. Crea tu cliente fetch en `src/app/panel/_lib/<submodulo>.ts` (archivo nuevo).

## Estados por documento (máquinas)
- **Cotización** (`quotes`, módulo `cotizaciones`): borrador → enviada → aceptada | rechazada; enviada+vencida (si `valid_until < hoy`, mostrar "vencida" en el mapper sin cambiar la BD).
- **Pedido** (`orders`, módulo `ordenes`): pipeline `transition_order` (borrador→confirmado→pagado→surtido_parcial→surtido→facturado→enviado, +cancelada). Entregas por partida vía `record_delivery` (fija surtido_parcial/surtido). **`order_items.qty` es INTEGER → redondea la qty al insertar partidas de pedido.**
- **Remisión** (`sales_notes`, módulo `remisiones`): abierta → cobrada (`cobrar_remision` aplica inventario) → (facturada por Tanda C) | cancelada (solo desde 'abierta').
- **Factura** (`invoices`, módulo `facturacion`): borrador → timbrada (`getPacProvider().timbrar`) → pagada | pago_parcial (`registrar_pago_factura`; si PPD, timbra REP antes con `.timbrarREP` y pasa `uuid_rep`) | cancelada (`.cancelar` + motivo). **Folio de factura: usa `next_folio(p_org,'invoice')` (entero) + `serie` (default 'A')**, NO `nextSerieFolio` (respeta el esquema serie/folio existente de `invoices`).

## Verificación (cada agente la hace y reporta)
`cd ~/APLIKA-AI && npx tsc --noEmit` y `npm run lint` limpios sobre tus archivos. Reporta: archivos creados, endpoints, y resultado de typecheck/lint. Si una firma compartida no calza, ajústate a ella (léela); NO modifiques lo compartido — repórtalo.
