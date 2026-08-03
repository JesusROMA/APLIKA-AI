import { z } from 'zod';
import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import { round2 } from '@/lib/erp/totals';
import type { Tables, TablesInsert, Json } from '@/lib/supabase/database.types';
import type {
  POLine,
  PurchaseOrderDetail,
  PurchaseOrderRow,
} from '@/lib/types/erp-compras';

/**
 * Piezas internas COMPARTIDAS por los endpoints de órdenes de compra (submódulo
 * `compras`). No es una route (prefijo `_`): esquemas zod, normalización de
 * partidas + totales en servidor, mapeos a camelCase, carga de detalle y
 * traducción de errores de RPC.
 *
 * Flujo OC: borrador → confirmada → (recibir parcial/total) recibida_parcial /
 * recibida | cancelada. La ENTRADA a inventario con costo (que sube el costo
 * promedio, F2) la hace la RPC compartida `recibir_compra`.
 */

// ===== Validación (zod) =====

/**
 * Partida de compra: variante (opcional) + cantidad y costo unitario. Línea
 * libre permitida si trae `name`. IVA opcional (se resuelve de la variante o
 * cae a 0.16 en servidor). Cantidades numeric(14,3); costos numeric(14,4).
 */
export const poLineSchema = z
  .object({
    productVariantId: z.string().uuid().nullish(),
    sku: z.string().trim().nullish(),
    name: z.string().trim().optional(),
    qty: z.number().positive('La cantidad debe ser mayor a 0'),
    unitCost: z.number().min(0, 'El costo no puede ser negativo'),
    ivaRate: z.number().min(0).max(1).optional(),
  })
  .refine((l) => Boolean(l.productVariantId) || Boolean(l.name && l.name.length > 0), {
    message: 'Cada partida requiere un producto o un nombre',
    path: ['name'],
  });

export type POLineBody = z.infer<typeof poLineSchema>;

/** Cuerpo de alta de OC. */
export const createPoSchema = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid().nullish(),
  expectedDate: z.string().trim().min(1).nullish(),
  notas: z.string().nullish(),
  lines: z.array(poLineSchema).min(1, 'Agrega al menos una partida'),
});

export type CreatePoBody = z.infer<typeof createPoSchema>;

/** Cuerpo de edición: notas siempre; partidas sólo si status 'borrador'. */
export const updatePoSchema = z.object({
  notas: z.string().nullable().optional(),
  lines: z.array(poLineSchema).min(1, 'Agrega al menos una partida').optional(),
});

export type UpdatePoBody = z.infer<typeof updatePoSchema>;

/** Línea de recepción (recibir_compra). */
export const receiveLineSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().positive('La cantidad a recibir debe ser mayor a 0'),
});

export const receivePoSchema = z.object({
  lines: z.array(receiveLineSchema).min(1, 'Captura al menos una partida a recibir'),
});

export type ReceivePoBody = z.infer<typeof receivePoSchema>;

// ===== Normalización de partidas + totales (server) =====

/** Partida ya calculada en servidor, lista para insertar. */
export interface POBuiltLine {
  productVariantId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unitCost: number;
  ivaRate: number;
  lineTotal: number;
}

const DEFAULT_IVA = 0.16;

/**
 * Resuelve sku/name/IVA desde la variante cuando viene `productVariantId`; la
 * línea libre usa el `name` capturado. Calcula `line_total = round(qty*costo,2)`.
 */
export async function buildPoLines(
  supabase: ErpClient,
  inputs: POLineBody[],
): Promise<POBuiltLine[]> {
  const out: POBuiltLine[] = [];
  for (const inp of inputs) {
    let sku = inp.sku ?? null;
    let name = inp.name ?? '';
    let ivaRate = inp.ivaRate ?? DEFAULT_IVA;

    if (inp.productVariantId) {
      const { data: v } = await supabase
        .from('product_variants')
        .select('sku, name, products ( iva_rate )')
        .eq('id', inp.productVariantId)
        .maybeSingle();
      if (v) {
        if (!sku) sku = v.sku;
        if (!name) name = v.name;
        if (inp.ivaRate === undefined) {
          const prod = v.products as { iva_rate: number } | null;
          ivaRate = Number(prod?.iva_rate ?? DEFAULT_IVA);
        }
      }
    }

    out.push({
      productVariantId: inp.productVariantId ?? null,
      sku,
      name,
      qty: inp.qty,
      unitCost: inp.unitCost,
      ivaRate,
      lineTotal: round2(inp.qty * inp.unitCost),
    });
  }
  return out;
}

/** Totales de la OC: subtotal = Σ line_total; tax = Σ round(line_total*iva). */
export function computePoTotals(lines: POBuiltLine[]): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const tax = round2(lines.reduce((s, l) => s + round2(l.lineTotal * l.ivaRate), 0));
  return { subtotal, tax, total: round2(subtotal + tax) };
}

/** Filas de `purchase_order_items` a insertar (qty_received arranca en 0). */
export function poItemInsertsFor(
  purchaseOrderId: string,
  organizationId: string,
  lines: POBuiltLine[],
): TablesInsert<'purchase_order_items'>[] {
  return lines.map((l) => ({
    purchase_order_id: purchaseOrderId,
    organization_id: organizationId,
    product_variant_id: l.productVariantId,
    sku: l.sku,
    name: l.name,
    qty: l.qty,
    qty_received: 0,
    unit_cost: l.unitCost,
    iva_rate: l.ivaRate,
    line_total: l.lineTotal,
  }));
}

// ===== Errores de RPC =====

/**
 * Traduce el error de `recibir_compra` a `ApiError`:
 *  - 42501 (RLS/permiso) → 403
 *  - P0001 (RAISE del negocio: estado/cantidad inválida) → 409
 *  - resto → 400
 */
export function poRpcError(error: { code?: string; message: string }): ApiError {
  if (error.code === '42501') return new ApiError(403, error.message);
  if (error.code === 'P0001') return new ApiError(409, error.message);
  return new ApiError(400, error.message);
}

// ===== Mapeos a camelCase =====

/** Cabecera con el join a `suppliers(name)`. */
export type PoHeaderRow = Pick<
  Tables<'purchase_orders'>,
  | 'id'
  | 'folio'
  | 'supplier_id'
  | 'warehouse_id'
  | 'status'
  | 'expected_date'
  | 'subtotal'
  | 'tax'
  | 'total'
  | 'created_at'
> & { suppliers: { name: string } | null };

export function mapPoRow(r: PoHeaderRow): PurchaseOrderRow {
  return {
    id: r.id,
    folio: r.folio,
    supplierId: r.supplier_id,
    supplierName: r.suppliers?.name ?? null,
    warehouseId: r.warehouse_id,
    status: r.status,
    expectedDate: r.expected_date,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    createdAt: r.created_at,
  };
}

/** Partida cruda de `purchase_order_items`. */
type PoItemRow = Pick<
  Tables<'purchase_order_items'>,
  | 'id'
  | 'product_variant_id'
  | 'sku'
  | 'name'
  | 'qty'
  | 'qty_received'
  | 'unit_cost'
  | 'iva_rate'
  | 'line_total'
>;

function mapPoItem(it: PoItemRow): POLine {
  return {
    id: it.id,
    productVariantId: it.product_variant_id,
    sku: it.sku,
    name: it.name,
    qty: Number(it.qty),
    qtyReceived: Number(it.qty_received),
    unitCost: Number(it.unit_cost),
    ivaRate: Number(it.iva_rate),
    lineTotal: Number(it.line_total),
  };
}

const DETAIL_SELECT =
  'id, folio, supplier_id, warehouse_id, status, expected_date, subtotal, tax, total, created_at, notas, suppliers ( name ), purchase_order_items ( id, product_variant_id, sku, name, qty, qty_received, unit_cost, iva_rate, line_total )';

/** Carga el detalle completo (cabecera + proveedor + partidas). */
export async function loadPoDetail(
  supabase: ErpClient,
  id: string,
): Promise<PurchaseOrderDetail> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Orden de compra no encontrada');

  const itemsRaw = (data.purchase_order_items ?? []) as PoItemRow[];
  const items = itemsRaw
    .map(mapPoItem)
    .sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));

  const header: PoHeaderRow = {
    id: data.id,
    folio: data.folio,
    supplier_id: data.supplier_id,
    warehouse_id: data.warehouse_id,
    status: data.status,
    expected_date: data.expected_date,
    subtotal: data.subtotal,
    tax: data.tax,
    total: data.total,
    created_at: data.created_at,
    suppliers: data.suppliers as { name: string } | null,
  };

  return {
    ...mapPoRow(header),
    notas: data.notas,
    items,
  };
}

/** Serializa las líneas de recepción al shape que espera la RPC (Json). */
export function receiveLinesToRpc(lines: ReceivePoBody['lines']): Json {
  return lines.map((l) => ({ item_id: l.itemId, qty: l.qty })) as Json;
}
