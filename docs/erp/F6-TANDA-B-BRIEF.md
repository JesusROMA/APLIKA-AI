# F6 · Tanda B — Brief compartido (Requisiciones + Órdenes de entrada)

> Común a AGENTE-REQUISICIONES ∥ AGENTE-ENTRADAS.

## Reglas duras
- SOLO `~/APLIKA-AI`. NUNCA otros proyectos. NO git, NO migraciones, NO `db reset`.
- **PROHIBIDO editar** compartido (`src/lib/**`, `_components/**`, `_lib/api.ts`/`ventas-api.ts`/`hooks.ts`, `panel.css`, `PanelShell`/`Sidebar`, layout) y archivos de otras áreas. Si necesitas tocar algo compartido, DETENTE y repórtalo.
- Archivos NUEVOS en tu subárbol + cliente `src/app/panel/_lib/<area>.ts`.

## Superficie compartida (plantillas: `src/app/api/erp/purchase-orders/route.ts` y `src/app/panel/compras/page.tsx`)
- **Tipos**: `@/lib/types/erp-compras` (`RequisitionRow/Detail`, `RequisitionItem/Input`, `RequisitionStatus`, `EntryOrderRow/Detail`, `EntryOrderItem/Input`, `EntryOrderStatus`, `EntryOrigin`, y para consumir OC: `PurchaseOrderDetail`, `POLine`) y `@/lib/types/erp` (`SessionInfo`,`Paginated`,`ListParams`).
- **Backend**: `@/lib/api` (`handle`,`ok`,`ApiError`); `@/lib/erp/session`; `@/lib/erp/guards` (`requireAccess`); `@/lib/erp/db` (`erpClientFor`); `@/lib/erp/pagination`; `@/lib/erp/folios` (`nextSerieFolio(supabase, orgId, 'requisition')`→REQ, `(...,'entry')`→OE); `@/lib/supabase/database.types`.
- **RPCs ya tipadas**: `aprobar_requisicion(p_req)`, `aplicar_entrada(p_eo)` (aplica inventario con costo + actualiza OC ligada; 42501→403).
- **Panel**: `ProductPicker`, `DataTable`, `Drawer`, `Field`, `States`, `Icon`; `hooks`; `session` (`useSession`,`useCan`); `listWarehouses` de `_lib/api`.

## Convenciones
- Route: `export const dynamic='force-dynamic'`; `handle`; `requireAccess(session, '<modulo>', accion)`; zod; paginado; camelCase; moneda es-MX.
- Requisiciones → módulo **`compras`**; Órdenes de entrada → módulo **`inventario`**.
- Folios: `nextSerieFolio`. Cantidades numeric(14,3), costos numeric(14,4).
- UI `'use client'`; permisos `useCan()`; cliente en `src/app/panel/_lib/<area>.ts`.

## Verificación (cada agente): `npx tsc --noEmit` y `npm run lint` limpios. Reporta archivos/endpoints/resultados. Si una firma no calza, ajústate; no toques lo compartido.
