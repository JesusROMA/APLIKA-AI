# FASE 4 — Transversales · Contratos (fuente de verdad)

> Superficie de administración que amarra F1–F3. El "motor" ya está en BD; F4 es
> mayormente UI + una migración mínima. Módulo RBAC principal: **`config`** (core,
> siempre activo si hay tenant; lectura `config/ver`, escritura `config/configurar`).
> Convenciones vigentes (F1–F3): `handle`/`requireAccess`, zod, RLS ya existente,
> tipos compartidos del orquestador, panel React.

## Alcance (aprobado: las 4 áreas)
1. **Configuración por tenant**: editor de permisos RBAC, activar/desactivar módulos, y series de folios.
2. **Bitácora/Auditoría**: consulta de `audit_log`.
3. **Dashboard consolidado**: KPIs cruzados en `/panel` según módulos activos.
4. **Branding + campos personalizados**: logo/color del tenant (para PDFs) y `custom_field_defs`.

## Hechos de BD ya existentes (NO recrear)
- `organizations` YA tiene `logo_url`, `brand_color`, `custom_domain`.
- `custom_field_defs(organization_id, module_key, field_key, label, field_type, required, options jsonb, sort, active)` YA existe con RLS (select/insert/update/delete).
- `audit_log` YA existe; RLS SELECT = super_admin o tenant_admin de la org (0010).
- `role_permissions` RLS permite overrides del tenant con `config/configurar` (0010).
- `org_series` RLS permite CRUD del tenant con `config/configurar` (0012).
- `organization_modules` write RLS = **solo super_admin** (0005) ⇒ se requiere RPC para autoservicio del dueño.

## C1 · Migración `0017_f4_transversales.sql` (AGENTE-DB) — mínima
```sql
-- Campos personalizados sobre el maestro de clientes (demostración de custom_field_defs)
alter table customers add column if not exists custom jsonb not null default '{}';

-- Autoservicio de módulos: el dueño (config/configurar) activa/desactiva módulos
-- de SU tenant (la RLS directa de organization_modules es solo super_admin).
create or replace function app.set_org_module(p_module_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_org uuid := app.current_org_id(); v_mod uuid;
begin
  if not app.has_perm('config','configurar') then
    raise exception 'forbidden: falta permiso config/configurar' using errcode='42501';
  end if;
  if v_org is null then raise exception 'sin organización de contexto'; end if;
  select id into v_mod from modules where key = p_module_key;
  if v_mod is null then raise exception 'módulo inexistente: %', p_module_key; end if;
  insert into organization_modules (organization_id, module_id, enabled)
    values (v_org, v_mod, p_enabled)
  on conflict (organization_id, module_id) do update set enabled = excluded.enabled;
  perform app.log_audit('module', p_module_key, case when p_enabled then 'activar' else 'desactivar' end, '{}'::jsonb, v_org);
end; $$;
create or replace function public.set_org_module(p_module_key text, p_enabled boolean)
returns void language sql security definer set search_path = public, app as $$
  select app.set_org_module(p_module_key, p_enabled);
$$;
grant execute on function public.set_org_module(text, boolean) to authenticated, service_role;
-- grants base al final; -- ROLLBACK: documental.
```
(No se tocan branding/custom_field_defs/audit_log/role_permissions/org_series: ya existen con su RLS.)

## C2 · Tipos TS compartidos (`src/lib/types/erp-config.ts` — ORQUESTADOR)
`PermissionEditorRow` (role, moduleKey, action, defaultAllowed, override|null, effective), `ModuleToggleRow`, `SeriesRow` (reusa el de erp-ventas o define uno), `BrandingInput`, `CustomFieldDef`/`CustomFieldInput`, `AuditRow`, `ConsolidatedDashboard` (KPIs por módulo).

## C3 · Piezas compartidas (mini-tanda orquestador)
- `src/lib/erp/config.ts`: helpers de lectura (defaults+overrides de permisos, módulos del catálogo con su estado).
- `<CustomFields>` (componente que renderiza inputs desde `custom_field_defs` sobre un `custom` jsonb) — lo construye el orquestador o AGENTE-CONFIG y el orquestador lo cablea al form de clientes en Tanda C.
- Branding: en Tanda C el orquestador cablea `logo_url`/`brand_color` del tenant a `PrintDocument` en las páginas `/print` de F1.
- Nav: `config` → `/panel/config`; agregar enlace a `/panel/auditoria`.

## C4 · Endpoints y páginas (Tanda B — 3 agentes ∥)
- **AGENTE-CONFIG** (módulo `config`): `src/app/api/erp/config/**` (permissions GET/PUT overrides; modules GET + POST toggle vía `set_org_module`; series CRUD sobre `org_series`; branding GET/PATCH `organizations`; custom-fields CRUD sobre `custom_field_defs`) + `src/app/panel/config/**` (página con pestañas: Permisos, Módulos, Folios, Branding, Campos personalizados). Todo gated `config/ver`|`config/configurar`.
- **AGENTE-AUDIT** (`config/ver` + RLS): `src/app/api/erp/audit/**` (GET paginado, filtros entity_type/action/rango de fecha) + `src/app/panel/auditoria/**` (tabla con filtros).
- **AGENTE-DASHBOARD** (módulo `dashboard`): extiende `src/app/api/erp/dashboard/route.ts` (KPIs cruzados: ventas del mes desde `orders`/`invoices`, CxC/antigüedad desde `invoices.saldo`, valor de inventario Σ`stock*avg_cost`, citas de hoy desde `appointments`) y `src/app/panel/page.tsx` (tarjetas condicionadas a `session.modules`). Reusa `KpiCard`.

## C5 · Mapa de propiedad
| Quién | Posee |
|---|---|
| AGENTE-DB | `supabase/migrations/0017_f4_transversales.sql`, `supabase/tests/f4_*.sql`, regen types |
| ORQUESTADOR | `src/lib/types/erp-config.ts`, `src/lib/erp/config.ts`, `<CustomFields>`, nav, cableado de branding en `/print` + custom fields en `/panel/clientes`, integración+QA+git |
| AGENTE-CONFIG | `src/app/api/erp/config/**`, `src/app/panel/config/**` |
| AGENTE-AUDIT | `src/app/api/erp/audit/**`, `src/app/panel/auditoria/**` |
| AGENTE-DASHBOARD | `src/app/api/erp/dashboard/route.ts`, `src/app/panel/page.tsx` |

## C6 · Criterios de aceptación F4
- [ ] Dueño (tenant_admin) cambia un permiso de un rol (override) y el efecto se refleja (p.ej. operador deja de poder crear); super_admin/otros roles sin `config/configurar` no pueden.
- [ ] Dueño activa/desactiva un módulo de su tenant (RPC), y la nav/RLS lo reflejan; un rol sin permiso → 403.
- [ ] Editar una serie de folios cambia el siguiente folio emitido.
- [ ] Bitácora lista eventos reales (transiciones, pagos, entregas, etc.) con filtros; un `tenant_user` NO ve la bitácora (RLS).
- [ ] Dashboard muestra solo KPIs de módulos activos y sus números cuadran con los reportes de cada área.
- [ ] Branding (logo/color) del tenant aparece en el PDF imprimible; campos personalizados definidos se capturan y persisten en `customers.custom`.
- [ ] `tsc`/`lint`/`build`/`supabase test db` verdes; sin regresiones F1–F3.
