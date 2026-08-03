# F4 · Tanda B — Brief compartido (Transversales)

> Común a AGENTE-CONFIG ∥ AGENTE-AUDIT ∥ AGENTE-DASHBOARD.

## Reglas duras
- SOLO `~/APLIKA-AI`. NUNCA otros proyectos. NO git, NO migraciones, NO `db reset`.
- **PROHIBIDO editar** (compartido): `src/lib/**`, `supabase/**`, `src/app/panel/_components/**`, `_lib/api.ts`/`ventas-api.ts`/`hooks.ts`, `panel.css`, `panel/layout.tsx`, `PanelShell`/`Sidebar`, y archivos de otras áreas. **Excepción para AGENTE-DASHBOARD**: sí edita `src/app/panel/page.tsx` y `src/app/api/erp/dashboard/route.ts` (son suyos en F4). Si necesitas tocar otro compartido, DETENTE y repórtalo.
- Archivos NUEVOS en tu subárbol + cliente `src/app/panel/_lib/<area>.ts`.

## Superficie compartida
- **Tipos**: `@/lib/types/erp-config` (`PermissionCell`,`PermissionOverrideInput`,`ModuleToggleRow`,`ConfigSeriesRow/Input`,`BrandingInfo/Input`,`CustomFieldDef/Input`,`CustomFieldType`,`AuditRow`) y `@/lib/types/erp` (`SessionInfo`,`Paginated`,`ListParams`,`DashboardData`,`DashboardKpi`).
- **Backend**: `@/lib/api` (`handle`,`ok`,`ApiError`); `@/lib/erp/session` (`getErpSession`); `@/lib/erp/guards` (`requireAccess`); `@/lib/erp/db` (`erpClientFor`); `@/lib/erp/pagination`; `@/lib/erp/config` (`fetchPermissionMatrix(supabase,orgId)`, `fetchModulesWithState(supabase,orgId)`); `@/lib/supabase/database.types`.
- **RPCs**: `supabase.rpc('set_org_module',{p_module_key,p_enabled})`, `supabase.rpc('set_org_branding',{p_logo_url,p_brand_color})` — ambas validan `has_perm('config','configurar')` (42501→403) y auditan.
- **RLS ya vigente**: `role_permissions` (INSERT/UPDATE con `config/configurar`; DELETE super_admin ⇒ NO borres overrides, haz upsert), `org_series` (INSERT/UPDATE con `config/configurar`; DELETE super_admin), `custom_field_defs` (CRUD con su RLS), `audit_log` (SELECT super_admin|tenant_admin), `organizations` (SELECT propio; escritura vía RPC).
- **Panel**: `DataTable`, `Drawer`, `Field` (Text/Number/Select/Checkbox), `States`, `Icon`, `KpiCard`; `@/app/panel/_lib/hooks`; `@/app/panel/_components/session` (`useSession`,`useCan`).

## Convenciones
- Route: `export const dynamic='force-dynamic'`; `handle`; `requireAccess(session,'<modulo>',accion)`; zod; camelCase.
- Módulo `config` es **core** (siempre activo si hay tenant): lectura `config/ver`, escritura `config/configurar`.
- UI `'use client'`; permisos `useCan()`; cliente fetch en `src/app/panel/_lib/<area>.ts`.

## Verificación (cada agente): `npx tsc --noEmit` y `npm run lint` limpios. Reporta archivos, endpoints, resultados. Si una firma no calza, ajústate; no toques lo compartido.
