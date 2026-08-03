# FASE 5 — Compras y Proveedores · Contratos (fuente de verdad)

> Cierra el ciclo de inventario con costo de entrada real: la **recepción** de una
> orden de compra aplica ENTRADA a inventario con `unit_cost` vía
> `adjust_inventory` (F2) ⇒ actualiza el **costo promedio ponderado**. Espejo
> "inbound" de Ventas. Módulo RBAC nuevo: **`compras`**. Proveedores = tabla
> nueva `suppliers` (maestro); productos = `product_variants` (reusa ProductPicker).
> Convenciones vigentes (F1–F4): migraciones con `-- ROLLBACK:`, RLS por operación,
> RPCs `app.*`+`public.*`, folios por `next_serie_folio`, guards `requireAccess`,
> tipos del orquestador, panel React.

## Alcance
1. **Proveedores**: maestro (CRUD) con datos fiscales y días de crédito.
2. **Órdenes de compra (OC)**: OC → confirmar → **recibir** (parcial/total).
3. **Recepción**: entra a inventario con costo → mueve el costo promedio (integra F2).
4. **Cuentas por pagar (CxP)**: factura de proveedor + pagos + antigüedad de saldo.

## Decisiones propuestas (marca si cambias alguna)
- **La recepción alimenta el costeo promedio** (entrada con `unit_cost` de la OC vía `adjust_inventory`). *(Es el punto clave; sin esto el costo de F2 nunca sube con datos reales.)*
- **Factura de proveedor con folio del proveedor** (texto libre + UUID opcional que ellos nos den); NO emitimos CFDI (eso es Ventas). CxP = espejo de CxC.
- **Un solo módulo `compras`** cubre Proveedores + OC + CxP (como `ordenes` cubre el pipeline de ventas).
- **Recepción sin documento de recepción aparte**: el RPC `recibir_compra` mueve inventario + `qty_received` por partida; el kardex lo registra con `ref_type='purchase'`. *(Simplicidad; un doc de recepción formal se puede agregar después.)*
- Cantidades: `qty` numeric(14,3) (coherente con quote/sales items); inventario entra como entero (redondeo en el RPC, coherente con `inventory.stock` INTEGER).

---

## C1 · Esquema BD (AGENTE-DB)

### C1.0 · Enums (`0018_f5_enums.sql`, aislado)
```
create type purchase_order_status  as enum ('borrador','confirmada','recibida_parcial','recibida','cancelada');
create type supplier_invoice_status as enum ('borrador','registrada','pagada','pago_parcial','cancelada');
```

### C1.1 · Proveedores (`suppliers`) — maestro
```sql
create table suppliers (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  rfc text,                              -- constraint como customers (^([A-ZÑ&]{3,4})[0-9]{6}[A-Z0-9]{3}$, opcional)
  contact_name text, phone text, email text, address text,
  payment_days int not null default 0,   -- días de crédito que nos dan
  balance numeric(14,2) not null default 0,  -- CxP (lo que les debemos)
  active boolean not null default true,
  custom jsonb not null default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (organization_id, name)
);
```
Módulo RLS: `compras`. Trigger touch_updated_at.

### C1.2 · Órdenes de compra
```sql
create table purchase_orders (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  folio text not null,                   -- next_serie_folio(org,'purchase') → 'OC-A-0001'
  supplier_id uuid not null references suppliers(id),
  warehouse_id uuid references warehouses(id),   -- destino de la recepción
  status purchase_order_status not null default 'borrador',
  expected_date date,
  subtotal numeric(14,2) not null default 0, tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  notas text, created_by uuid references profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (organization_id, folio)
);
create table purchase_order_items (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_variant_id uuid references product_variants(id),
  sku text, name text not null,
  qty numeric(14,3) not null check (qty > 0),
  qty_received numeric(14,3) not null default 0,
  unit_cost numeric(14,4) not null,      -- costo pactado con el proveedor
  iva_rate numeric(4,3) not null default 0.160,
  line_total numeric(14,2) not null
);
```
- RPC `public.recibir_compra(p_po uuid, p_lines jsonb) returns purchase_orders` (p_lines = `[{"item_id":uuid,"qty":number}]`): `has_perm('compras','editar')`; solo desde 'confirmada'/'recibida_parcial'; por cada línea: `adjust_inventory(variant, po.warehouse_id, +round(qty), 'entrada', 'Compra '||po.folio, 'purchase', po.id, po_item.unit_cost)` (⇒ **actualiza costo promedio**), suma a `qty_received` (clamp a `qty`); si todas las líneas completas ⇒ status 'recibida', si algo parcial ⇒ 'recibida_parcial'; audita. El warehouse debe existir (si null, usa el default de la org).
- `transitar` de OC: borrador→confirmada (update con `compras/editar`); →cancelada (`compras/cancelar`, solo si no hay recepciones).

### C1.3 · Cuentas por pagar (factura de proveedor)
```sql
create table supplier_invoices (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  supplier_id uuid not null references suppliers(id),
  purchase_order_id uuid references purchase_orders(id),
  folio text not null,                   -- folio del PROVEEDOR (texto libre)
  uuid text,                             -- folio fiscal que nos dieron (opcional)
  fecha date not null default current_date,
  subtotal numeric(14,2) not null default 0, tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  saldo numeric(14,2), status supplier_invoice_status not null default 'registrada',
  metodo_pago text, forma_pago text,
  created_by uuid references profiles(id), created_at timestamptz default now(), updated_at timestamptz default now()
);
create table supplier_invoice_payments (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  supplier_invoice_id uuid not null references supplier_invoices(id) on delete cascade,
  fecha date not null default current_date, monto numeric(14,2) not null check (monto>0),
  forma_pago text not null, created_by uuid references profiles(id), created_at timestamptz default now()
);
```
- Al registrar la factura (status 'registrada'): `saldo = total`, y `suppliers.balance += total` (CxP sube).
- RPC `public.registrar_pago_compra(p_invoice uuid, p_monto numeric, p_forma text) returns supplier_invoices`: `has_perm('compras','editar')`; solo 'registrada'/'pago_parcial'; inserta pago; `saldo = total - Σpagos`; status 'pagada' (saldo<=0) o 'pago_parcial'; `suppliers.balance -= monto`; audita.

### C1.4 · Folios, módulo, RLS, grants
- `next_serie_folio`: extender el CASE de prefijo por defecto con `'purchase'→'OC'`; seed `org_series` de `('purchase','OC')` para orgs existentes.
- Módulo `compras` (UUID `c0000000-0000-0000-0000-00000000000d`, sort 13, route_prefix 'compras') en `modules`; agregar a `verticals.default_modules` de `inventario_pesado`; activar en sus tenants; seed `role_permissions` (3 roles × 5 acciones).
- RLS por operación (patrón DO-loop) módulo `compras` para: `suppliers`, `purchase_orders`, `purchase_order_items`, `supplier_invoices`, `supplier_invoice_payments`. Bloque de grants base. `-- ROLLBACK:` documental.

## C2 · Tipos TS compartidos (`src/lib/types/erp-compras.ts` — ORQUESTADOR)
`SupplierRow`, `PurchaseOrderRow/Detail`, `POLineInput`, `ReceiveLineInput`, `SupplierInvoiceRow/Detail`, `SupplierInvoicePaymentRow`, `CxpRow` (antigüedad), enums espejo. Amplía `FolioDocType` con `'purchase'`.

## C3 · Piezas compartidas (mini-tanda orquestador)
- Nav: `compras` → `/panel/compras` (Sidebar/PanelShell).
- Reutiliza `ProductPicker` (variante) y `CustomerPicker`-style para proveedor (o un `SupplierPicker` sencillo dentro del submódulo). El editor de partidas de OC (ProductPicker + qty + **costo unitario**) lo construye AGENTE-COMPRAS (DocLinesEditor es de ventas, resuelve precio de venta; compras usa costo).

## C4 · Endpoints y páginas (Tanda B — 3 agentes ∥)
- **AGENTE-PROVEEDORES** (módulo `compras`): `src/app/api/erp/suppliers/**` (CRUD paginado, RFC/SAT opcional) + `src/app/panel/compras/proveedores/**`.
- **AGENTE-COMPRAS**: `src/app/api/erp/purchase-orders/**` (CRUD, confirmar, **recibir**, cancelar) + `src/app/panel/compras/page.tsx` (raíz: OC + nav a Proveedores/CxP) y `src/app/panel/compras/[id]/**`.
- **AGENTE-CXP**: `src/app/api/erp/supplier-invoices/**` (crear [sube balance], registrar pago, cancelar, CxP con antigüedad) + `src/app/panel/compras/cxp/**`.

## C5 · Mapa de propiedad
| Quién | Posee |
|---|---|
| AGENTE-DB | `supabase/migrations/0018_*`,`0019_*`, `supabase/tests/f5_*.sql`, regen types |
| ORQUESTADOR | `src/lib/types/erp-compras.ts`, `FolioDocType` (+purchase), nav, integración+QA+git |
| AGENTE-PROVEEDORES | `src/app/api/erp/suppliers/**`, `src/app/panel/compras/proveedores/**` |
| AGENTE-COMPRAS | `src/app/api/erp/purchase-orders/**`, `src/app/panel/compras/page.tsx` + `src/app/panel/compras/[id]/**` + `src/app/panel/compras/_components/**` |
| AGENTE-CXP | `src/app/api/erp/supplier-invoices/**`, `src/app/panel/compras/cxp/**` |

## C6 · Criterios de aceptación F5
- [ ] Recibir una OC aplica ENTRADA a inventario con el `unit_cost` de la OC y **sube el costo promedio** del artículo (verificable contra la valuación de F2).
- [ ] Recepción parcial deja la OC en 'recibida_parcial' y `qty_received` correcto; completar ⇒ 'recibida'.
- [ ] Registrar factura de proveedor sube `suppliers.balance` (CxP); pagos bajan el saldo y el balance; status pagada/pago_parcial.
- [ ] Reporte CxP con antigüedad (0-30/31-60/61-90/+90) cuadra con los saldos.
- [ ] RBAC: viewer no crea/recibe/paga (403/42501); tenant sin módulo `compras` bloqueado por RLS.
- [ ] `tsc`/`lint`/`build`/`supabase test db` verdes; sin regresiones F1–F4 (incl. costeo F2 y ventas).
