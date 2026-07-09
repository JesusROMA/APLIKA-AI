# FASE 0 — Contratos (fuente de verdad)

> Documento de contratos del orquestador. Los subagentes CONSUMEN estos
> contratos; ninguno los modifica. Si un contrato está mal, se reporta al
> orquestador, que lo corrige y relanza a los afectados.
>
> Decisiones ratificadas: UI nueva en React/Next.js gradual (`/panel`),
> RBAC por acción, ERP solo en modo real (sin demo), build siempre verde.
> Convenciones: se mantiene `organization_id`, español en enums/datos/UI,
> migraciones `NNNN_nombre.sql` con sección `-- ROLLBACK:` documentada.

## C1 · Esquema de BD (migración `0009_f0_fundaciones.sql` — AGENTE-DB)

### C1.1 RBAC por acción
- Enum `user_role`: agregar valor `'tenant_viewer'` (Solo-lectura).
  Semántica final: `tenant_admin` = Dueño/Admin · `tenant_user` = Operador ·
  `tenant_viewer` = Solo-lectura · (`super_admin`, `customer` sin cambios).
- Nueva tabla `role_permissions`:
  ```sql
  create table role_permissions (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references organizations(id), -- NULL = default global
    role user_role not null,
    module_key text not null,       -- key de modules o módulo virtual 'maestros'
    action text not null check (action in ('ver','crear','editar','cancelar','configurar')),
    allowed boolean not null,
    unique (organization_id, role, module_key, action)
  );
  ```
  Resolución: fila específica del tenant → si no existe, fila default
  (organization_id IS NULL) → si no existe, `false`.
- Seed de defaults (organization_id NULL):
  | rol | ver | crear | editar | cancelar | configurar |
  |---|---|---|---|---|---|
  | tenant_admin | ✔ | ✔ | ✔ | ✔ | ✔ |
  | tenant_user (Operador) | ✔ | ✔ | ✔ | ✖ | ✖ |
  | tenant_viewer | ✔ | ✖ | ✖ | ✖ | ✖ |
  (Aplicado a cada module_key existente + `'maestros'`.)
- Helpers SQL (SECURITY DEFINER, schema `app`):
  - `app.has_perm(p_module text, p_action text) → boolean` — super_admin ⇒
    true; service_role ⇒ true; si no, resuelve role del uid + role_permissions.
  - `app.org_has_module(p_module text) → boolean` — organization_modules
    enabled para current_org_id(); los module_key `'dashboard'`,`'config'`
    (core) y el virtual `'maestros'` devuelven true si la org existe.

### C1.2 Reescritura de políticas RLS (de FOR ALL → por operación)
Para cada tabla operativa, reemplazar `tenant_isolation` por 4 políticas:
```
SELECT: org match AND app.org_has_module(M) AND app.has_perm(M,'ver')
INSERT: org match AND app.org_has_module(M) AND app.has_perm(M,'crear')
UPDATE: org match AND app.org_has_module(M) AND app.has_perm(M,'editar')
DELETE: solo app.is_super_admin()   -- documentos se cancelan, no se borran
```
(`org match` = `organization_id = app.current_org_id() OR app.is_super_admin()`;
las políticas RESTRICTIVE existentes del rol `customer` NO se tocan.)

Mapa tabla → module_key (M):
| Tablas | M |
|---|---|
| customers, products, product_variants, price_lists, price_list_items, warehouses | `maestros` |
| orders, order_items | `ordenes` |
| inventory, inventory_movements | `inventario` |
| invoices | `facturacion` |
| payments | `pagos` |
| appointments | `calendario` |
| ai_conversations, ai_messages | `ia_agente` |
| subscriptions, org_counters | (solo org match; sin módulo/permiso) |
| audit_log, custom_field_defs, role_permissions | ver C1.4/C1.5 |

Nota crítica de compatibilidad: los endpoints existentes del panel dc siguen
funcionando porque tenant_admin/tenant_user conservan ver/crear/editar; la
única resta deliberada es `cancelar`/`configurar` a Operador y toda escritura
a Solo-lectura.

### C1.3 Impersonación de super_admin (cablear de verdad)
- `app.current_org_id()` v2: además del GUC `app.impersonate_org`, leer el
  header PostgREST: `current_setting('request.headers', true)::json ->>
  'x-aplika-impersonate'` — SOLO si `app.is_super_admin()`. Orden: GUC →
  header → profiles.organization_id.
- Backend (AGENTE-BACKEND): `POST /api/admin/tenants/[id]/impersonate` setea
  cookie httpOnly firmada `aplika_impersonate=<org_id>`; `DELETE` la limpia.
  `createSupabaseServerClient()` acepta `{ impersonateOrgId? }` y agrega el
  header `x-aplika-impersonate` a `global.headers` cuando la sesión es
  super_admin y la cookie existe. `requireTenant()` deja de rechazar a
  super_admin si hay impersonación activa (devuelve la org impersonada).
  `/api/auth/me` refleja `impersonating: {org...}`.

### C1.4 Auditoría transversal
```sql
create table audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations(id),
  actor_id uuid references profiles(id),
  entity_type text not null,   -- 'order','invoice','customer','module',...
  entity_id text not null,
  action text not null,        -- 'crear','editar','cancelar','transicion','config',...
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
-- índices: (organization_id, created_at desc), (organization_id, entity_type, entity_id)
```
- RLS: SELECT solo tenant_admin (y super_admin); INSERT/UPDATE/DELETE nadie
  (solo vía helper). Helper `app.log_audit(entity_type, entity_id, action,
  detail)` SECURITY DEFINER que resuelve org y actor del contexto.
- `transition_order` v2: registra en audit_log cada transición (además del
  comportamiento actual). Patrón a seguir por todo documento futuro (F1+).

### C1.5 Campos personalizados (base, sin UI)
```sql
create table custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  module_key text not null,
  field_key text not null,     -- snake_case
  label text not null,
  field_type text not null check (field_type in ('text','number','date','select','bool')),
  required boolean not null default false,
  options jsonb not null default '[]',  -- para 'select'
  sort int not null default 0,
  active boolean not null default true,
  unique (organization_id, module_key, field_key)
);
```
RLS: SELECT miembros de la org; escritura solo con `has_perm(module,'configurar')`.
Los valores viven en el jsonb del recurso (`product_variants.attributes` hoy;
los documentos F1 nacerán con columna `custom jsonb not null default '{}'`).

### C1.6 Maestros — columnas y catálogos SAT
- `products`: `+ tipo text not null default 'producto' check (tipo in ('producto','servicio'))`,
  `+ clave_prod_serv text` (SAT c_ClaveProdServ), `+ iva_rate numeric(4,3) not null default 0.160`.
- `product_variants`: `+ clave_unidad text not null default 'H87'` (SAT c_ClaveUnidad).
- `customers`: `+ cp text check (cp ~ '^[0-9]{5}$')` (domicilio fiscal, CFDI 4.0),
  `+ regimen_code text`, `+ uso_cfdi_code text`. Migrar datos existentes
  extrayendo el código del formato actual "601 · Descripción" (split en ' · ').
  Validación de RFC: constraint `rfc ~* '^([A-ZÑ&]{3,4})[0-9]{6}[A-Z0-9]{3}$'`
  (NULL permitido; `XAXX010101000`/`XEXX010101000` válidos por el patrón).
- Catálogos SAT globales (lectura authenticated, escritura super_admin), con
  subconjunto seed razonable para PyME:
  `sat_regimen_fiscal(code pk, label)` · `sat_uso_cfdi(code pk, label)` ·
  `sat_clave_unidad(code pk, label)`. FKs suaves: `customers.regimen_code
  → sat_regimen_fiscal(code)`, `customers.uso_cfdi_code → sat_uso_cfdi(code)`,
  `product_variants.clave_unidad → sat_clave_unidad(code)`.
- `price_list_items`: sin cambio de esquema; el POST de pedidos (F0-backend)
  DEBE resolver precio: item de la lista del cliente → si no hay, `base_price_mxn`.

### C1.7 Rollback
La migración incluye al final una sección comentada `-- ROLLBACK:` con los
DROPs/ALTERs inversos en orden seguro (documentación, no ejecutable).

## C2 · Tipos TypeScript compartidos (`src/lib/types/erp.ts` — los escribe el ORQUESTADOR)
Ver archivo. Resumen: `ModuleKey`, `PermAction`, `Role`, `Paginated<T>`,
`ListParams`, filas de maestros (`CustomerRow`, `ProductRow`, `VariantRow`,
`WarehouseRow`, `PriceListRow`), `SessionInfo` (con `impersonating`),
`PermissionMap`. Nadie más los edita; los subagentes los importan.

## C3 · Firmas de endpoints (namespace nuevo `/api/erp/*` — AGENTE-BACKEND)
Reglas: todos con `requireTenant()` + `requireModule(M)` + `requirePerm(M, acción)`
(guards nuevos en `src/lib/erp/guards.ts`); Zod en todo input; **paginación
obligatoria** en listados (`?page=1&pageSize=25&search=&status=`); respuesta
de listado = `Paginated<T> { data, page, pageSize, total }`; errores
`{ error: string }` con 400/401/403/404/422. Los endpoints existentes de
`/api/*` NO se tocan (el panel dc sigue vivo).

| Endpoint | Métodos | M / acción | Notas |
|---|---|---|---|
| `/api/erp/me` | GET | — | sesión + org + módulos activos + PermissionMap (la UI oculta acciones; el servidor manda) |
| `/api/erp/customers` | GET, POST | maestros ver/crear | GET paginado; POST valida RFC/CP/catálogos |
| `/api/erp/customers/[id]` | GET, PATCH | maestros ver/editar | PATCH parcial; `active` para soft-inactivar |
| `/api/erp/products` | GET, POST | maestros ver/crear | GET incluye variantes + stock agregado; POST crea producto+variante(s) |
| `/api/erp/products/[id]` | GET, PATCH | maestros ver/editar | incluye claves SAT/iva/tipo |
| `/api/erp/warehouses` | GET, POST | maestros ver/crear | |
| `/api/erp/warehouses/[id]` | PATCH | maestros editar | |
| `/api/erp/price-lists` | GET, POST | maestros ver/crear | |
| `/api/erp/price-lists/[id]/items` | GET, PUT | maestros ver/editar | PUT reemplaza items (upsert masivo) |
| `/api/erp/dashboard` | GET | dashboard ver | KPIs según módulos activos (reusa lógica de `/api/dashboard/kpis`, forma limpia sin SVG/labels) |
| `/api/admin/tenants/[id]/impersonate` | POST, DELETE | super_admin | v2: cookie firmada (C1.3) |

## C4 · Máquinas de estado
F0 no introduce documentos nuevos. Contrato transversal desde F0: toda
transición de estado (hoy: `transition_order`) registra en `audit_log`.
Las máquinas de F1 (COT/REM/FAC) se contratarán al abrir F1.

## C5 · Mapa de propiedad de archivos (Tanda B — nadie pisa a nadie)
| Subagente | Posee (crea/edita) | Prohibido |
|---|---|---|
| AGENTE-DB (Tanda A) | `supabase/migrations/0009_*.sql`, `supabase/tests/*.sql`, regenerar `src/lib/supabase/database.types.ts` | todo lo demás |
| AGENTE-BACKEND | `src/lib/erp/**` (guards, catálogos, fetchers), `src/app/api/erp/**`, cambios puntuales contratados en `src/lib/auth.ts` (requireTenant+impersonación), `src/lib/supabase/server.ts` (header impersonate), `src/app/api/admin/tenants/[id]/impersonate/route.ts` | migraciones, `src/app/panel/**`, tipos compartidos, panel dc |
| AGENTE-UI | `src/app/panel/**` (layout, nav, dashboard, maestros), `src/app/panel/panel.css` (tokens portados de la landing) | `src/app/api/**`, `src/lib/**` (solo importa), migraciones, panel dc |
| AGENTE-QA-SEEDS | `supabase/seed.sql` (extensiones), `scripts/qa/**` | migraciones, src/** |
| ORQUESTADOR | `src/lib/types/erp.ts`, `docs/erp/**`, integración Tanda C, git | — |

## C6 · Criterios de aceptación F0 (los corre el orquestador en Tanda C)
- [ ] Activar/desactivar un módulo cambia menú (React), rutas y endpoints (403 backend).
- [ ] Operador no puede cancelar; Solo-lectura no puede crear (probado vía API directa, no solo UI).
- [ ] RFC inválido rechazado (422) en alta/edición de cliente; CP inválido igual.
- [ ] Aislamiento entre tenants intacto (pgTAP + 2 sesiones).
- [ ] Impersonación: super_admin entra al panel de un tenant y opera con RLS correcta; queda bitácora en audit_log.
- [ ] Pedido nuevo toma precio de la lista del cliente (fallback a precio base).
- [ ] Panel dc existente sigue funcionando sin regresiones.
- [ ] `tsc`, `next lint`, `next build`, `vitest`, `supabase test db` verdes.
