# F5 · Tanda B — Brief compartido (Compras y Proveedores)

> Común a AGENTE-PROVEEDORES ∥ AGENTE-COMPRAS ∥ AGENTE-CXP. Módulo RBAC: **`compras`**.

## Reglas duras
- SOLO `~/APLIKA-AI`. NUNCA otros proyectos. NO git, NO migraciones, NO `db reset`.
- **PROHIBIDO editar** (compartido): `src/lib/**`, `supabase/**`, `src/app/panel/_components/**`, `_lib/api.ts`/`ventas-api.ts`/`hooks.ts`, `panel.css`, `panel/layout.tsx`, `PanelShell`/`Sidebar`, y archivos de otras áreas. Si necesitas tocar algo compartido, DETENTE y repórtalo.
- Archivos NUEVOS en tu subárbol + cliente `src/app/panel/_lib/<area>.ts`.

## Superficie compartida (plantillas: `src/app/api/erp/quotes/route.ts` backend, `src/app/panel/pedidos/[id]/page.tsx` UI)
- **Tipos**: `@/lib/types/erp-compras` (`SupplierRow/Input`, `PurchaseOrderRow/Detail`, `POLine/POLineInput`, `ReceiveLineInput`, `SupplierInvoiceRow/Detail`, `SupplierInvoicePaymentRow`, `CxpRow`, `PurchaseOrderStatus`, `SupplierInvoiceStatus`) y `@/lib/types/erp` (`SessionInfo`,`Paginated`,`ListParams`).
- **Backend**: `@/lib/api` (`handle`,`ok`,`ApiError`); `@/lib/erp/session` (`getErpSession`); `@/lib/erp/guards` (`requireAccess`); `@/lib/erp/db` (`erpClientFor`); `@/lib/erp/pagination`; `@/lib/erp/folios` (`nextSerieFolio(supabase, orgId, 'purchase')` → 'OC-A-0001'); `@/lib/supabase/database.types`.
- **RPCs ya tipadas**:
  - `recibir_compra(p_po, p_lines)` — aplica ENTRADA a inventario con el `unit_cost` de la OC (sube costo promedio F2), suma `qty_received`, fija status recibida_parcial/recibida. `p_lines = [{item_id, qty}]`. Valida `has_perm('compras','editar')` (42501→403).
  - `registrar_pago_compra(p_invoice, p_monto, p_forma)` — inserta pago, recalcula saldo/status, BAJA `suppliers.balance`. (42501→403).
- **Totales en servidor**: calcula `line_total = round(qty*unit_cost*(1-discount?), 2)` (compras normalmente sin descuento de línea), `subtotal`/`tax` (Σ line*iva)/`total` en el endpoint al crear la OC / factura.
- **Panel**: `@/app/panel/_components/ProductPicker` (variante), `DataTable`, `Drawer`, `Field` (Text/Number/Select/Checkbox), `States`, `Icon`; `@/app/panel/_lib/hooks`; `@/app/panel/_components/session` (`useSession`,`useCan`); `listWarehouses` de `@/app/panel/_lib/api`. Ruta `/panel/compras` ya en el Sidebar.

## Convenciones
- Route: `export const dynamic='force-dynamic'`; `handle`; `requireAccess(session,'compras',accion)`; zod; paginado; camelCase; moneda `Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'})`.
- La **subida** de `suppliers.balance` al registrar una factura de proveedor la hace el ENDPOINT de AGENTE-CXP (la BD solo la baja en el pago vía RPC).
- Cantidades numeric(14,3); costos numeric(14,4). Folios OC vía `nextSerieFolio(...,'purchase')`; la factura de proveedor usa el folio del proveedor (texto libre).
- UI `'use client'`; permisos `useCan()`; cliente fetch en `src/app/panel/_lib/<area>.ts`.

## Verificación (cada agente): `npx tsc --noEmit` y `npm run lint` limpios. Reporta archivos, endpoints, resultados. Si una firma no calza, ajústate; no toques lo compartido.
