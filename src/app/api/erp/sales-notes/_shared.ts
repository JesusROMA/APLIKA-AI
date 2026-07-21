import { z } from 'zod';
import type { ErpClient } from '@/lib/erp/db';
import type { DocLine, SalesNoteRow, SalesNoteDetail } from '@/lib/types/erp-ventas';

/**
 * Piezas compartidas del submódulo Remisiones (docType `sales_note`).
 * NO es una ruta (solo `route.ts` lo es): selects, mappers a camelCase y el
 * esquema zod de partidas que reusan `route.ts`, `[id]`, `cobrar` y `cancelar`.
 */

export const LIST_SELECT =
  'id, folio, customer_id, warehouse_id, status, subtotal, tax, total, payment_method, paid_at, created_at, customers ( name )';

export const DETAIL_SELECT =
  'id, folio, customer_id, warehouse_id, status, subtotal, tax, total, payment_method, paid_at, created_at, stock_applied, cancel_reason, custom, customers ( name ), sales_note_items ( id, product_variant_id, sku, name, qty, unit_price, discount_pct, iva_rate, line_total )';

interface HeaderShape {
  id: string;
  folio: string;
  customer_id: string | null;
  warehouse_id: string | null;
  status: SalesNoteRow['status'];
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  customers: { name: string } | null;
}

interface ItemShape {
  id: string;
  product_variant_id: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  iva_rate: number;
  line_total: number;
}

type DetailShape = HeaderShape & {
  stock_applied: boolean;
  cancel_reason: string | null;
  custom: unknown;
  sales_note_items: ItemShape[];
};

/** Fila del listado (camelCase). `customerName = null` ⇒ "Público en general". */
export function toRow(r: HeaderShape): SalesNoteRow {
  return {
    id: r.id,
    folio: r.folio,
    customerId: r.customer_id,
    customerName: r.customers?.name ?? null,
    warehouseId: r.warehouse_id,
    status: r.status,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    paymentMethod: r.payment_method,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  };
}

/** Partida persistida → `DocLine` (camelCase). */
export function toDocLine(it: ItemShape): DocLine {
  return {
    id: it.id,
    productVariantId: it.product_variant_id,
    sku: it.sku,
    name: it.name,
    qty: Number(it.qty),
    unitPrice: Number(it.unit_price),
    discountPct: Number(it.discount_pct),
    ivaRate: Number(it.iva_rate),
    lineTotal: Number(it.line_total),
  };
}

function toDetail(r: DetailShape): SalesNoteDetail {
  return {
    ...toRow(r),
    stockApplied: r.stock_applied,
    cancelReason: r.cancel_reason,
    custom: (r.custom ?? {}) as Record<string, unknown>,
    items: (r.sales_note_items ?? []).map(toDocLine),
  };
}

/** Detalle completo (cabecera + partidas) o `null` si no existe / no visible. */
export async function fetchDetail(
  supabase: ErpClient,
  id: string,
): Promise<SalesNoteDetail | null> {
  const { data, error } = await supabase
    .from('sales_notes')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toDetail(data as unknown as DetailShape);
}

/** Partida de entrada. Requiere producto o descripción (línea libre). */
export const LineInput = z
  .object({
    productVariantId: z.string().uuid().nullable().optional(),
    sku: z.string().nullable().optional(),
    name: z.string().optional(),
    qty: z.number().positive(),
    unitPrice: z.number().nonnegative().optional(),
    discountPct: z.number().min(0).max(100).optional(),
    ivaRate: z.number().min(0).optional(),
  })
  .refine((l) => Boolean(l.productVariantId) || Boolean(l.name && l.name.trim()), {
    message: 'Cada partida requiere un producto o una descripción',
  });
