# F7 · Tanda B — Brief compartido (CRM · Pagos · CxC)

> Común a AGENTE-CRM ∥ AGENTE-PAGOS ∥ AGENTE-CXC.

## Reglas duras
- SOLO `~/APLIKA-AI`. NUNCA otros proyectos. NO git, NO migraciones, NO `db reset`.
- **PROHIBIDO editar** compartido (`src/lib/**`, `_components/**`, `_lib/api.ts`/`ventas-api.ts`/`hooks.ts`, `panel.css`, `PanelShell`/`Sidebar`, layout) y archivos de OTRAS áreas. AGENTE-CXC SÍ puede reconstruir `src/app/panel/facturacion/cxc/**` (es su área en F7) pero NO otros archivos de `facturacion/**`. Si necesitas tocar algo más, DETENTE y repórtalo.
- Archivos NUEVOS en tu subárbol + cliente `src/app/panel/_lib/<area>.ts`.

## Superficie compartida
- **Tipos**: `@/lib/types/erp-crm` (`ProspectRow/Input`,`ProspectStage`,`CustomerHistory/Doc`), `@/lib/types/erp` (`SessionInfo`,`Paginated`,`ListParams`,`CustomerRow`), `@/lib/types/erp-ventas` (`InvoiceRow`,`DocLineInput`), `@/lib/types/erp-compras`.
- **Backend**: `@/lib/api` (`handle`,`ok`,`ApiError`); `@/lib/erp/session`; `@/lib/erp/guards` (`requireAccess`); `@/lib/erp/db` (`erpClientFor`); `@/lib/erp/pagination`; `@/lib/erp/folios` (`nextSerieFolio`); `@/lib/erp/documents` (`buildLines`,`computeTotals`); `@/lib/supabase/database.types`.
- **RPCs**: `registrar_pago_factura(p_invoice,p_monto,p_forma,p_uuid_rep?)` (CxC), etc.
- **Panel**: `DataTable`,`Drawer`,`Field`,`States`,`Icon`,`CustomerPicker`,`ProductPicker`,`DocLinesEditor`; `hooks`; `session` (`useSession`,`useCan`).

## Convenciones
- Route: `export const dynamic='force-dynamic'`; `handle`; `requireAccess(session,'<modulo>',accion)`; zod; paginado; camelCase; moneda es-MX.
- Módulos: CRM→`crm`, Pagos→`pagos`, CxC→`facturacion`.
- Factura ahora usa folio de serie `FAC-A-0001` (una sola cadena en `invoices.folio`); **muestra `folio` solo** (no `serie-folio`).
- UI `'use client'`; permisos `useCan()`; cliente en `src/app/panel/_lib/<area>.ts`.

## Verificación (cada agente): `npx tsc --noEmit` y `npm run lint` limpios. Reporta archivos/endpoints/resultados. Si una firma no calza, ajústate; no toques lo compartido.
