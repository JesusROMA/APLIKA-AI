import { z } from 'zod';
import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import type { Tables, TablesInsert } from '@/lib/supabase/database.types';
import type {
  EntryOrderDetail,
  EntryOrderItem,
  EntryOrderRow,
  EntryOrderStatus,
  EntryOrigin,
} from '@/lib/types/erp-compras';

/**
 * Piezas internas COMPARTIDAS por los endpoints de órdenes de entrada (submódulo
 * `inventario`). No es una route (prefijo `_`): esquemas zod, normalización de
 * partidas en servidor, mapeos a camelCase, carga de detalle y traducción de
 * errores de la RPC.
 *
 * Flujo OE: borrador → aplicada | cancelada. La ENTRADA a inventario con costo
 * (que sube el costo promedio, F2, y actualiza la OC ligada) la hace la RPC
 * compartida `aplicar_entrada`. Este es el ÚNICO camino de entrada de inventario.
 */

// ===== Catálogos válidos =====

export const ENTRY_STATUSES: ReadonlySet<EntryOrderStatus> = new Set<EntryOrderStatus>([
  'borrador',
  'aplicada',
  'cancelada',
]);

export const ENTRY_ORIGINS: ReadonlySet<EntryOrigin> = new Set<EntryOrigin>([
  'compra',
  'manual',
  'ajuste',
  'devolucion',
]);

// ===== Validación (zod) =====

/**
 * Partida de entrada: variante (opcional) + cantidad y costo unitario. Línea
 * libre permitida si trae `name`. `purchaseOrderItemId` liga la partida a la OC
 * de origen (trazabilidad de la recepción). Cantidades numeric(14,3); costos
 * numeric(14,4).
 */
export const entryItemSchema = z
  .object({
    productVariantId: z.string().uuid().nullish(),
    sku: z.string().trim().nullish(),
    name: z.string().trim().optional(),
    qty: z.number().positive('La cantidad debe ser mayor a 0'),
    unitCost: z.number().min(0, 'El costo no puede ser negativo'),
    purchaseOrderItemId: z.string().uuid().nullish(),
  })
  .refine((l) => Boolean(l.productVariantId) || Boolean(l.name && l.name.length > 0), {
    message: 'Cada partida requiere un producto o un nombre',
    path: ['name'],
  });

export type EntryItemBody = z.infer<typeof entryItemSchema>;

/** Cuerpo de alta de OE. */
export const createEntrySchema = z.object({
  warehouseId: z.string().uuid(),
  origin: z.enum(['compra', 'manual', 'ajuste', 'devolucion']),
  purchaseOrderId: z.string().uuid().nullish(),
  notas: z.string().nullish(),
  items: z.array(entryItemSchema).min(1, 'Agrega al menos una partida'),
});

export type CreateEntryBody = z.infer<typeof createEntrySchema>;

/** Cuerpo de edición: notas siempre; partidas sólo si status 'borrador'. */
export const updateEntrySchema = z.object({
  notas: z.string().nullable().optional(),
  items: z.array(entryItemSchema).min(1, 'Agrega al menos una partida').optional(),
});

export type UpdateEntryBody = z.infer<typeof updateEntrySchema>;

// ===== Normalización de partidas (server) =====

/** Partida ya resuelta en servidor, lista para insertar. */
export interface EntryBuiltItem {
  productVariantId: string | null;
  purchaseOrderItemId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unitCost: number;
}

/**
 * Resuelve sku/name desde la variante cuando viene `productVariantId`; la línea
 * libre usa el `name` capturado.
 */
export async function buildEntryItems(
  supabase: ErpClient,
  inputs: EntryItemBody[],
): Promise<EntryBuiltItem[]> {
  const out: EntryBuiltItem[] = [];
  for (const inp of inputs) {
    let sku = inp.sku ?? null;
    let name = inp.name ?? '';

    if (inp.productVariantId) {
      const { data: v } = await supabase
        .from('product_variants')
        .select('sku, name')
        .eq('id', inp.productVariantId)
        .maybeSingle();
      if (v) {
        if (!sku) sku = v.sku;
        if (!name) name = v.name;
      }
    }

    out.push({
      productVariantId: inp.productVariantId ?? null,
      purchaseOrderItemId: inp.purchaseOrderItemId ?? null,
      sku,
      name,
      qty: inp.qty,
      unitCost: inp.unitCost,
    });
  }
  return out;
}

/** Filas de `entry_order_items` a insertar. */
export function entryItemInsertsFor(
  entryOrderId: string,
  organizationId: string,
  items: EntryBuiltItem[],
): TablesInsert<'entry_order_items'>[] {
  return items.map((it) => ({
    entry_order_id: entryOrderId,
    organization_id: organizationId,
    product_variant_id: it.productVariantId,
    purchase_order_item_id: it.purchaseOrderItemId,
    sku: it.sku,
    name: it.name,
    qty: it.qty,
    unit_cost: it.unitCost,
  }));
}

// ===== Errores de RPC =====

/**
 * Traduce el error de `aplicar_entrada` a `ApiError`:
 *  - 42501 (RLS/permiso) → 403
 *  - P0001 (RAISE del negocio: estado inválido) → 409
 *  - resto → 400
 */
export function entryRpcError(error: { code?: string; message: string }): ApiError {
  if (error.code === '42501') return new ApiError(403, error.message);
  if (error.code === 'P0001') return new ApiError(409, error.message);
  return new ApiError(400, error.message);
}

// ===== Mapeos a camelCase =====

/** Cabecera con el join a `warehouses(name)`. */
export type EoHeaderRow = Pick<
  Tables<'entry_orders'>,
  | 'id'
  | 'folio'
  | 'warehouse_id'
  | 'origin'
  | 'purchase_order_id'
  | 'status'
  | 'applied_at'
  | 'created_at'
> & { warehouses: { name: string } | null };

export function mapEntryRow(r: EoHeaderRow): EntryOrderRow {
  return {
    id: r.id,
    folio: r.folio,
    warehouseId: r.warehouse_id,
    warehouseName: r.warehouses?.name ?? null,
    origin: r.origin as EntryOrigin,
    purchaseOrderId: r.purchase_order_id,
    status: r.status,
    appliedAt: r.applied_at,
    createdAt: r.created_at,
  };
}

/** Partida cruda de `entry_order_items`. */
type EoItemRow = Pick<
  Tables<'entry_order_items'>,
  'id' | 'purchase_order_item_id' | 'product_variant_id' | 'sku' | 'name' | 'qty' | 'unit_cost'
>;

function mapEntryItem(it: EoItemRow): EntryOrderItem {
  return {
    id: it.id,
    purchaseOrderItemId: it.purchase_order_item_id,
    productVariantId: it.product_variant_id,
    sku: it.sku,
    name: it.name,
    qty: Number(it.qty),
    unitCost: Number(it.unit_cost ?? 0),
  };
}

const DETAIL_SELECT =
  'id, folio, warehouse_id, origin, purchase_order_id, status, applied_at, created_at, notas, warehouses ( name ), entry_order_items ( id, purchase_order_item_id, product_variant_id, sku, name, qty, unit_cost )';

/** Carga el detalle completo (cabecera + almacén + partidas). */
export async function loadEntryDetail(
  supabase: ErpClient,
  id: string,
): Promise<EntryOrderDetail> {
  const { data, error } = await supabase
    .from('entry_orders')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Orden de entrada no encontrada');

  const itemsRaw = (data.entry_order_items ?? []) as EoItemRow[];
  const items = itemsRaw
    .map(mapEntryItem)
    .sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));

  const header: EoHeaderRow = {
    id: data.id,
    folio: data.folio,
    warehouse_id: data.warehouse_id,
    origin: data.origin,
    purchase_order_id: data.purchase_order_id,
    status: data.status,
    applied_at: data.applied_at,
    created_at: data.created_at,
    warehouses: data.warehouses as { name: string } | null,
  };

  return {
    ...mapEntryRow(header),
    notas: data.notas,
    items,
  };
}
