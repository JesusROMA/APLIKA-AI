# F2 · Tanda B — Brief compartido (Inventario)

> Común a AGENTE-MOVIMIENTOS ∥ AGENTE-CONTEOS ∥ AGENTE-TRASPASOS. Cada uno
> construye SOLO su área. Módulo RBAC: **`inventario`** (ver/crear/editar/cancelar).

## Reglas duras
- Trabajas SOLO en `~/APLIKA-AI`. NUNCA otros proyectos (Reservi). NO git, NO migraciones, NO `db reset`.
- **PROHIBIDO editar** (compartido): `src/lib/**`, `supabase/**`, `src/app/panel/_components/**`, `src/app/panel/_lib/api.ts`, `src/app/panel/_lib/ventas-api.ts`, `src/app/panel/_lib/hooks.ts`, `src/app/panel/panel.css`, `src/app/panel/layout.tsx`, `PanelShell`/`Sidebar`, y los archivos de OTRAS áreas. Si necesitas tocar algo compartido, DETENTE y repórtalo.
- Creas archivos NUEVOS solo en tu subárbol (ver tu prompt) + un cliente `src/app/panel/_lib/<area>.ts`.

## Superficie compartida (léela: plantillas `src/app/api/erp/quotes/route.ts` backend y `src/app/panel/pedidos/[id]/page.tsx` UI)
- **Tipos**: `@/lib/types/erp-inventario` (`StockRow`, `KardexRow`, `MovementInput`, `MovementType`, `CountRow/CountDetail/CountItem/CountItemInput`, `CountStatus`, `TransferRow/TransferDetail/TransferItem/TransferItemInput`, `TransferStatus`, `ValuationRow`) y `@/lib/types/erp` (`SessionInfo`, `Paginated`, `ListParams`).
- **Backend**: `@/lib/api` (`handle`,`ok`,`ApiError`); `@/lib/erp/session` (`getErpSession`); `@/lib/erp/guards` (`requireAccess(session,'inventario',accion)`); `@/lib/erp/db` (`erpClientFor`); `@/lib/erp/pagination` (`parseListParams`,`rangeFor`,`paginated`); `@/lib/erp/folios` (`nextSerieFolio(supabase, orgId, docType)` — docType `'count'`→CONT, `'transfer'`→TRAS); `@/lib/supabase/database.types`.
- **RPCs ya tipadas** (`supabase.rpc`):
  - `adjust_inventory(p_variant, p_warehouse, p_qty, p_type, p_reason, p_ref_type, p_ref_id, p_unit_cost?)` — mantiene costo promedio + kardex. `p_qty` con signo. `p_type` in ('entrada','salida','ajuste').
  - `aplicar_conteo(p_count)`, `enviar_traspaso(p_transfer)`, `recibir_traspaso(p_transfer)`, `cancelar_traspaso(p_transfer, p_motivo)` — todas validan `has_perm('inventario', …)` y auditan; propaga errcode `42501` como 403.
- **Panel**: `@/app/panel/_components/ProductPicker` (búsqueda de variante), `DataTable`, `Drawer`, `Field` (TextField/NumberField/SelectField), `States` (Badge/Spinner/EmptyState/ErrorState/ReadOnlyBadge), `Icon`; `@/app/panel/_lib/hooks` (`useAsyncData`,`usePaginated`); `@/app/panel/_components/session` (`useSession`,`useCan`); `listWarehouses` de `@/app/panel/_lib/api` para selects de almacén. La ruta `/panel/inventario` ya está en el Sidebar.

## Convenciones
- Route: `export const dynamic='force-dynamic'`; `handle`; `requireAccess(session,'inventario',accion)`; zod; listados paginados `{count:'exact'}`; filas a **camelCase**; moneda `Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'})`.
- Movimientos manuales: guarda `requireAccess('inventario','crear')` y luego `supabase.rpc('adjust_inventory', {...})` con el signo correcto (entrada +qty, salida −qty, ajuste qty tal cual), `p_type`, `p_ref_type:'manual'`, `p_unit_cost` en entradas.
- Cantidades ENTERAS (`stock`/`qty` son INTEGER). Folios por `nextSerieFolio`.
- UI: `'use client'`; permisos con `useCan()`; estados con `States`. Cliente fetch en `src/app/panel/_lib/<area>.ts` (nuevo).

## Verificación (cada agente): `cd ~/APLIKA-AI && npx tsc --noEmit` y `npm run lint` limpios sobre tus archivos. Reporta archivos, endpoints y resultados. Si una firma no calza, ajústate a ella; no modifiques lo compartido.
