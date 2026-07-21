# FASE 2 — Inventario · Contratos (fuente de verdad)

> Extiende el inventario existente (F0): `inventory` (stock por variante+almacén),
> `inventory_movements` (kardex), `adjust_inventory()`. Módulo RBAC ya existente:
> **`inventario`** (acciones ver/crear/editar/cancelar/configurar ya sembradas).
> Convenciones F1 vigentes: migraciones `NNNN_*.sql` con `-- ROLLBACK:`, RLS por
> operación con `has_perm`/`org_has_module`, folios por `next_serie_folio`, RPCs
> `app.*` SECURITY DEFINER + wrapper `public.*`, totales/costos en servidor,
> guards `requireAccess`, endpoints `/api/erp/*` paginados, panel React en
> `/app/panel/inventario`, tipos compartidos propiedad del orquestador.

## Alcance
1. **Costeo promedio ponderado** por variante+almacén (kardex valuado).
2. **Movimientos manuales**: entradas (con costo unitario), salidas, ajustes, con kardex y saldo/costo corridos.
3. **Conteos físicos** (cíclicos): captura contra sistema → genera ajustes.
4. **Traspasos entre almacenes** (en tránsito → recibido), moviendo el costo.
5. **Reportes**: kardex por variante (saldo y costo corridos) y **valuación** (stock × costo promedio) por almacén.

## Decisiones propuestas (marca si quieres cambiarlas)
- **Costo promedio por (variante, almacén)** — cada almacén mantiene su propio costo promedio. *(Alternativa: costo único por variante a nivel empresa.)*
- **Traspaso en dos pasos**: `borrador → en_transito` (salida del origen) `→ recibido` (entrada al destino), para reflejar mercancía en tránsito. *(Alternativa: traspaso inmediato de un paso.)*
- **Sin módulo de compras** todavía: las entradas se capturan como movimiento con costo (proveedor = texto libre en `reason`). El módulo de Compras/Proveedores se valora en una fase posterior.
- **Cantidades enteras** (coherente con `inventory.stock`/`order_items.qty` INTEGER).

---

## C1 · Esquema BD (AGENTE-DB — migración `0014_f2_inventario.sql`)

### C1.0 · Enums nuevos (CREATE TYPE; no hay ALTER de enums existentes)
- `inventory_count_status` = ('borrador','en_conteo','aplicado','cancelada')
- `inventory_transfer_status` = ('borrador','en_transito','recibido','cancelada')
- `movement_type` NO cambia (entrada/salida/ajuste); traspasos/conteos usan esos tipos con `ref_type` = 'transfer' | 'count' | 'manual'.

### C1.1 · Costeo (columnas additivas)
```sql
alter table inventory add column avg_cost numeric(14,4) not null default 0;  -- costo promedio (variante+almacén)
alter table inventory_movements
  add column unit_cost      numeric(14,4),        -- costo unitario del movimiento (entrada) o costo de salida
  add column avg_cost_after numeric(14,4),        -- costo promedio tras el movimiento (snapshot kardex)
  add column balance_after  integer;              -- saldo de stock tras el movimiento (snapshot kardex)
```

### C1.2 · `adjust_inventory` v2 (costeo promedio + snapshots)
Reescribe `app.adjust_inventory`/`public.adjust_inventory` con un parámetro nuevo **opcional al final** (compatibilidad con `apply_order_stock`):
```
adjust_inventory(p_variant uuid, p_warehouse uuid, p_qty int, p_type movement_type default 'ajuste',
                 p_reason text default null, p_ref_type text default 'adjustment', p_ref_id uuid default null,
                 p_unit_cost numeric default null) returns inventory
```
Lógica (con `for update` sobre la fila de inventory):
- **Entrada** (`p_qty > 0`) con `p_unit_cost`: `new_avg = (old_stock*old_avg + p_qty*unit_cost) / (old_stock + p_qty)` (si `old_stock+p_qty>0`; si el stock previo era ≤0, `new_avg = unit_cost`). El movimiento guarda `unit_cost = p_unit_cost`.
- **Salida** (`p_qty < 0`): `unit_cost = avg_cost` actual (COGS), `avg_cost` no cambia.
- **Ajuste** positivo con `p_unit_cost` ⇒ como entrada; negativo o sin costo ⇒ usa `avg_cost`.
- Actualiza `inventory.stock` y `avg_cost`; inserta el movimiento con `unit_cost`, `avg_cost_after`, `balance_after`. Mantiene la validación `allow_backorder`. La firma de 7 args existente sigue válida (nuevo arg default null). Re-grant de ambas firmas.

### C1.3 · Conteos físicos
```sql
create table inventory_counts (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  folio text not null,                         -- next_serie_folio(org,'count') → 'CONT-A-0001'
  warehouse_id uuid not null references warehouses(id),
  status inventory_count_status not null default 'borrador',
  notas text, created_by uuid references profiles(id),
  created_at timestamptz default now(), applied_at timestamptz,
  unique (organization_id, folio)
);
create table inventory_count_items (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  count_id uuid not null references inventory_counts(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id),
  system_qty  integer not null default 0,      -- snapshot del stock al capturar
  counted_qty integer,                          -- lo contado físicamente (null = pendiente)
  unique (count_id, product_variant_id)
);
```
RPC `public.aplicar_conteo(p_count uuid) returns inventory_counts`: exige `has_perm('inventario','editar')`; sólo desde 'borrador'/'en_conteo'; por cada item con `counted_qty` no nulo y `counted_qty <> system_qty`, llama `adjust_inventory(variant, count.warehouse, counted_qty - system_qty, 'ajuste', 'Conteo '||folio, 'count', count.id)`; status→'aplicado', `applied_at=now()`; audita.

### C1.4 · Traspasos entre almacenes
```sql
create table inventory_transfers (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  folio text not null,                          -- next_serie_folio(org,'transfer') → 'TRAS-A-0001'
  from_warehouse_id uuid not null references warehouses(id),
  to_warehouse_id   uuid not null references warehouses(id),
  status inventory_transfer_status not null default 'borrador',
  notas text, created_by uuid references profiles(id),
  created_at timestamptz default now(), shipped_at timestamptz, received_at timestamptz,
  check (from_warehouse_id <> to_warehouse_id),
  unique (organization_id, folio)
);
create table inventory_transfer_items (
  id uuid pk default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  transfer_id uuid not null references inventory_transfers(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id),
  qty integer not null check (qty > 0),
  unit_cost numeric(14,4)                        -- costo capturado al enviar (para valuar la entrada)
);
```
- RPC `public.enviar_traspaso(p_transfer uuid)`: `has_perm('inventario','editar')`; sólo desde 'borrador'; por cada item: `adjust_inventory(variant, from_wh, -qty, 'salida', 'Traspaso '||folio, 'transfer', id)` y guarda en el item el `unit_cost = avg_cost` del origen (costo que viaja); status→'en_transito', `shipped_at=now()`.
- RPC `public.recibir_traspaso(p_transfer uuid)`: `has_perm('inventario','editar')`; sólo desde 'en_transito'; por cada item: `adjust_inventory(variant, to_wh, +qty, 'entrada', 'Traspaso '||folio, 'transfer', id, item.unit_cost)`; status→'recibido', `received_at=now()`.
- Cancelar (`cancelar_traspaso`): sólo desde 'borrador' (en_transito requiere recibir o reversar — fuera de alcance F2, se documenta).

### C1.5 · Folios, RLS, grants
- Seed en `org_series` de `('count','CONT')` y `('transfer','TRAS')` para orgs existentes.
- RLS por operación (patrón F0/F1) en las 4 tablas nuevas, módulo `inventario`. `inventory`/`inventory_movements` ya tienen RLS (F0).
- Bloque de grants base al final (idempotente). `-- ROLLBACK:` documental.

## C2 · Tipos TS compartidos (`src/lib/types/erp-inventario.ts` — ORQUESTADOR)
`StockRow` (variante, almacén, stock, avgCost, valor), `KardexRow` (fecha, tipo, qty, unitCost, avgCostAfter, balanceAfter, reason), `MovementInput`, `CountRow`/`CountDetail`/`CountItem`, `TransferRow`/`TransferDetail`/`TransferItem`, `ValuationRow`, enums espejo.

## C3 · Piezas compartidas (mini-tanda del orquestador)
- `src/lib/erp/inventory.ts`: helpers de costeo/valuación (lecturas), y wrapper de folios ya existe (`nextSerieFolio`).
- Añadir `inventario` al `MODULE_ROUTES` del `Sidebar` → `/panel/inventario`; título en `PanelShell`.
- Reutiliza `ProductPicker` (búsqueda de variante) y el patrón `DataTable`/`Drawer`.

## C4 · Endpoints y páginas por área (Tanda B — 3 agentes ∥)
- **AGENTE-MOVIMIENTOS**: `src/app/api/erp/inventory/**` (GET stock paginado con costo/valor; GET `/kardex?variantId=&warehouseId=`; POST `/movimientos` entrada/salida/ajuste con costo; GET `/valuacion`) + `src/app/panel/inventario/**` (existencias, kardex, alta de movimiento, valuación).
- **AGENTE-CONTEOS**: `src/app/api/erp/inventory-counts/**` (CRUD, capturar conteo, aplicar) + `src/app/panel/inventario/conteos/**`.
- **AGENTE-TRASPASOS**: `src/app/api/erp/inventory-transfers/**` (CRUD, enviar, recibir, cancelar) + `src/app/panel/inventario/traspasos/**`.

## C5 · Mapa de propiedad
| Quién | Posee |
|---|---|
| AGENTE-DB (Tanda A) | `supabase/migrations/0014_f2_inventario.sql`, `supabase/tests/f2_*.sql`, regen `database.types.ts` |
| ORQUESTADOR | `src/lib/types/erp-inventario.ts`, `src/lib/erp/inventory.ts`, `Sidebar`/`PanelShell` (ruta+título), integración+git, QA |
| AGENTE-MOVIMIENTOS | `src/app/api/erp/inventory/**`, `src/app/panel/inventario/**` (raíz: existencias/kardex/movimiento/valuación) |
| AGENTE-CONTEOS | `src/app/api/erp/inventory-counts/**`, `src/app/panel/inventario/conteos/**` |
| AGENTE-TRASPASOS | `src/app/api/erp/inventory-transfers/**`, `src/app/panel/inventario/traspasos/**` |

## C6 · Criterios de aceptación F2
- [ ] Entrada con costo actualiza el **costo promedio** ponderado; salida sale al promedio; kardex muestra saldo y costo corridos.
- [ ] Valuación (Σ stock×avg_cost) por almacén cuadra con el kardex.
- [ ] Conteo físico genera ajustes sólo por las diferencias y deja `aplicado` (auditado); sin diferencias ⇒ sin movimientos.
- [ ] Traspaso: enviar descuenta del origen (en_transito), recibir suma al destino con el costo que viajó; el stock total (ambos almacenes) se conserva.
- [ ] `apply_order_stock` (pedidos) sigue funcionando con la firma vieja y ahora sale al costo promedio (COGS correcto).
- [ ] RBAC: viewer no puede registrar movimientos/aplicar conteos/traspasar (403/42501); tenant sin módulo `inventario` bloqueado por RLS.
- [ ] `tsc`/`lint`/`build`/`supabase test db` verdes; sin regresiones en Ventas.
