import { z } from 'zod';
import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import { round2 } from '@/lib/erp/totals';
import type { DocLine, OrderDetail } from '@/lib/types/erp-ventas';
import type { TablesInsert } from '@/lib/supabase/database.types';

/**
 * Piezas compartidas del submódulo PEDIDOS (namespace ERP nuevo). Solo las usan
 * los endpoints de `src/app/api/erp/orders/**`. No forma parte de la superficie
 * compartida del orquestador; vive dentro de la propiedad de AGENTE-PEDIDOS.
 */

/** Partida de entrada validada para crear/editar un pedido. */
export const docLineInputSchema = z.object({
  productVariantId: z.string().uuid().nullable().optional(),
  sku: z.string().nullable().optional(),
  name: z.string().optional(),
  qty: z.number().positive('La cantidad debe ser mayor a 0'),
  unitPrice: z.number().nonnegative().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  ivaRate: z.number().min(0).optional(),
});
export type DocLineInputParsed = z.infer<typeof docLineInputSchema>;

/** Cada partida debe tener variante o una descripción (línea libre). */
export function assertLinesValid(lines: DocLineInputParsed[]): void {
  for (const l of lines) {
    if (!l.productVariantId && !(l.name && l.name.trim())) {
      throw new ApiError(422, 'Cada partida requiere un producto o una descripción');
    }
  }
}

/**
 * Mapea partidas ya calculadas (`buildLines`) a filas de `order_items`.
 * `order_items.qty` es INTEGER ⇒ se redondea la cantidad con `Math.round`.
 * `qty_delivered` arranca en 0 (aún sin entregas).
 */
export function orderItemRows(
  lines: DocLine[],
  orderId: string,
  orgId: string,
): TablesInsert<'order_items'>[] {
  return lines.map((l) => ({
    order_id: orderId,
    organization_id: orgId,
    product_variant_id: l.productVariantId,
    sku: l.sku,
    name: l.name,
    qty: Math.round(l.qty),
    unit_price: l.unitPrice,
    line_total: l.lineTotal,
    qty_delivered: 0,
  }));
}

/** Extrae el nombre de una relación embebida to-one (objeto o arreglo). */
export function relName(rel: unknown): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return (rel[0] as { name?: string } | undefined)?.name ?? null;
  return (rel as { name?: string }).name ?? null;
}

const ORDER_SELECT =
  'id, folio, customer_id, status, channel, subtotal, tax, total, items_count, created_at, warehouse_id, notes, stock_applied, customers ( name )';

interface OrderItemRow {
  id: string;
  product_variant_id: string | null;
  sku: string | null;
  name: string;
  qty: number;
  qty_delivered: number;
  unit_price: number;
  line_total: number;
}

/**
 * Reconstruye una `DocLine` desde `order_items`. La tabla no guarda IVA ni
 * descuento por partida (solo unit_price/line_total), así que:
 *  - el % de descuento se deriva de `line_total` vs bruto (importes exactos);
 *  - la tasa de IVA se aproxima con la mezcla `tax/subtotal` de la cabecera,
 *    para que los totales recomputados del editor coincidan con los guardados.
 */
function toDocLine(r: OrderItemRow, blendedIva: number): DocLine {
  const qty = Number(r.qty);
  const unitPrice = Number(r.unit_price);
  const lineTotal = Number(r.line_total);
  const gross = qty * unitPrice;
  let discountPct = gross > 0 ? round2((1 - lineTotal / gross) * 100) : 0;
  if (discountPct < 0) discountPct = 0;
  return {
    id: r.id,
    productVariantId: r.product_variant_id,
    sku: r.sku,
    name: r.name,
    qty,
    unitPrice,
    discountPct,
    ivaRate: blendedIva,
    lineTotal,
    qtyDelivered: Number(r.qty_delivered),
  };
}

/** Carga el detalle completo de un pedido (cabecera + partidas). 404 si no existe. */
export async function loadOrderDetail(supabase: ErpClient, id: string): Promise<OrderDetail> {
  const { data: o, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!o) throw new ApiError(404, 'Pedido no encontrado');

  const { data: items, error: iErr } = await supabase
    .from('order_items')
    .select('id, product_variant_id, sku, name, qty, qty_delivered, unit_price, line_total')
    .eq('order_id', id)
    .order('id');
  if (iErr) throw iErr;

  const subtotal = Number(o.subtotal);
  const tax = Number(o.tax);
  const blendedIva = subtotal > 0 ? tax / subtotal : 0.16;

  return {
    id: o.id,
    folio: o.folio,
    customerId: o.customer_id,
    customerName: relName(o.customers),
    status: o.status,
    channel: o.channel,
    subtotal,
    tax,
    total: Number(o.total),
    itemsCount: o.items_count,
    createdAt: o.created_at,
    warehouseId: o.warehouse_id,
    notes: o.notes,
    stockApplied: o.stock_applied,
    items: (items ?? []).map((r) => toDocLine(r as OrderItemRow, blendedIva)),
  };
}
