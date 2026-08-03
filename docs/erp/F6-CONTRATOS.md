# FASE 6 — Requisiciones y Órdenes de Entrada · Contratos

> Completa la estructura por sectores. Dos piezas nuevas + **cambio de política**:
> las **Órdenes de Entrada son el ÚNICO camino de entrada de inventario** (todo
> lo que suma stock pasa por ahí; el operador las aplica). Se retira la "entrada"
> directa de Movimientos (F2) y el "Recibir" directo de la OC (F5).
> Convenciones vigentes (F1–F5). Módulos: Requisiciones→`compras`, Órdenes de
> entrada→`inventario`.

## Alcance y trazabilidad
**Requisición** (compras) → **Orden de Compra** → **Orden de Entrada** (aplicación → inventario con costo) → **Factura de proveedor** → **CxP**. Todo ligado.

## Decisiones (confirmadas por Jesús)
- **Órdenes de Entrada = único camino de entrada** de stock. `adjust_inventory('entrada',…)` solo se invoca desde `aplicar_entrada`.
- Movimientos manuales (F2) quedan con **salida** y **ajuste** (los ajustes son correcciones/mermas); **se quita 'entrada'**.
- La OC ya no se "recibe" directo: genera una **Orden de Entrada** que el operador aplica.
- Requisición aprobada se **convierte a OC** (eligiendo proveedor).

## C1 · Esquema BD (AGENTE-DB)

### 0020_f6_enums.sql
```
create type requisition_status as enum ('borrador','aprobada','rechazada','convertida','cancelada');
create type entry_order_status as enum ('borrador','aplicada','cancelada');
```

### 0021_f6_requisiciones_entradas.sql
- `next_serie_folio`: extender CASE con `'requisition'→'REQ'` y `'entry'→'OE'`; seed `org_series` para ambos.
- **`requisitions`** (id, org, folio, status requisition_status default 'borrador', notas, created_by, created_at, updated_at) + **`requisition_items`** (id, org, requisition_id, product_variant_id, sku, name, qty numeric(14,3), estimated_cost numeric(14,4)). RLS módulo `compras`.
- **`entry_orders`** (id, org, folio, warehouse_id references warehouses, origin text check in ('compra','manual','ajuste','devolucion'), purchase_order_id uuid references purchase_orders, status entry_order_status default 'borrador', notas, created_by, applied_at, created_at, updated_at) + **`entry_order_items`** (id, org, entry_order_id, purchase_order_item_id uuid null, product_variant_id, sku, name, qty numeric(14,3), unit_cost numeric(14,4)). RLS módulo `inventario`.
- RPC `public.aprobar_requisicion(p_req uuid) returns requisitions`: `has_perm('compras','editar')`; borrador→aprobada; audita. (rechazar = update simple con motivo en el endpoint.)
- RPC `public.aplicar_entrada(p_eo uuid) returns entry_orders`: `has_perm('inventario','editar')`; solo 'borrador'; por cada item: `adjust_inventory(variant, eo.warehouse_id, round(qty)::int, 'entrada', 'Entrada '||folio, 'entry', eo.id, unit_cost)` (⇒ **costo promedio**); si `purchase_order_item_id` no nulo: `qty_received += qty` en esa partida de OC; al final, si hay `purchase_order_id`, recalcula el status de la OC (recibida_parcial/recibida) como hacía `recibir_compra`; status 'aplicada', applied_at; audita.
- **Nota:** `recibir_compra` (F5) queda OBSOLETA (no la llamará la UI); documéntalo, no la borres.
- Bloque de grants base; `-- ROLLBACK:` documental.

## C2 · Tipos compartidos (`src/lib/types/erp-compras.ts` EXTENDER — ORQUESTADOR)
Agregar: `RequisitionRow/Detail`, `RequisitionItem/Input`, `RequisitionStatus`, `EntryOrderRow/Detail`, `EntryOrderItem/Input`, `EntryOrderStatus`, `EntryOrigin`. `FolioDocType` += 'requisition' | 'entry'.

## C3 · Piezas compartidas (orquestador)
- `FolioDocType`; nav: activar Requisiciones (`/panel/compras/requisiciones`) y Órdenes de entrada (`/panel/inventario/entradas`) (quitar `soon`).
- **Exclusividad (Tanda C):** editar F2 `movimientos/route.ts` (rechazar type='entrada' → 422 "Las entradas se hacen por Órdenes de entrada") y `MovementDrawer` (quitar opción entrada); editar F5 PO detalle (quitar "Recibir", agregar "Generar orden de entrada" → navega a `/panel/inventario/entradas/nueva?poId=`).

## C4 · Endpoints y páginas (Tanda B — 2 agentes ∥)
- **AGENTE-REQUISICIONES** (módulo `compras`): `src/app/api/erp/requisitions/**` (CRUD, aprobar, rechazar, **convertir a OC** [body supplierId → crea purchase_order con los items, estimated_cost→unit_cost, liga requisition]) + `src/app/panel/compras/requisiciones/**`.
- **AGENTE-ENTRADAS** (módulo `inventario`): `src/app/api/erp/entry-orders/**` (CRUD; crear manual o desde OC [body `{origin, warehouseId, purchaseOrderId?, items:[{productVariantId, qty, unitCost, purchaseOrderItemId?}]}`]; **aplicar** [rpc aplicar_entrada]; cancelar) + `src/app/panel/inventario/entradas/**` (lista, nueva [soporta `?poId=` precargando las partidas pendientes de esa OC], detalle con "Aplicar").

## C5 · Propiedad
| Quién | Posee |
|---|---|
| AGENTE-DB | `0020_*`,`0021_*`, `supabase/tests/f6_*.sql`, regen types |
| ORQUESTADOR | tipos erp-compras (extensión), FolioDocType, nav, exclusividad (F2 movimientos + F5 PO detalle), integración+QA+git |
| AGENTE-REQUISICIONES | `src/app/api/erp/requisitions/**`, `src/app/panel/compras/requisiciones/**` |
| AGENTE-ENTRADAS | `src/app/api/erp/entry-orders/**`, `src/app/panel/inventario/entradas/**` |

## C6 · Aceptación
- [ ] Aplicar una Orden de Entrada sube stock con costo y mueve el costo promedio; es el **único** camino (movimiento manual 'entrada' → 422).
- [ ] Orden de entrada ligada a una OC actualiza `qty_received` y el status de la OC al aplicarse.
- [ ] Requisición aprobada → convertir a OC (con proveedor) genera la OC ligada; requisición queda 'convertida'.
- [ ] RBAC: operador puede crear/aplicar entradas; viewer no (42501); sin módulo → RLS.
- [ ] `tsc`/`lint`/`build`/`supabase test db` verdes; sin regresiones (ventas/compras/costeo).
