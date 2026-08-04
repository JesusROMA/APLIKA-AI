import { z } from 'zod';
import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import type { Tables, TablesInsert } from '@/lib/supabase/database.types';
import type { DocLine, QuoteDetail, QuoteRow, QuoteStatus } from '@/lib/types/erp-ventas';

/**
 * Piezas internas COMPARTIDAS por los endpoints de cotizaciones (propiedad del
 * submódulo `cotizaciones`). No es una route (prefijo `_`): esquemas zod,
 * mapeos a camelCase y helpers de estado/fechas. Los totales SIEMPRE se calculan
 * en servidor con `buildLines`/`computeTotals` (pieza compartida del orquestador).
 */

// ===== Validación (zod) =====

/** Partida de entrada: variante o línea libre (requiere descripción). */
export const lineInputSchema = z
  .object({
    productVariantId: z.string().uuid().nullable().optional(),
    sku: z.string().nullable().optional(),
    name: z.string().optional(),
    qty: z.number().positive('La cantidad debe ser mayor a 0'),
    unitPrice: z.number().nonnegative().optional(),
    discountPct: z.number().min(0).max(100).optional(),
    ivaRate: z.number().min(0).optional(),
  })
  .refine((l) => Boolean(l.productVariantId) || Boolean(l.name && l.name.trim()), {
    message: 'La línea libre requiere descripción',
    path: ['name'],
  });

/** Cuerpo de alta/edición de cotización (cabecera + partidas). */
export const quoteBodySchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  // F8: almacén de salida y lista de precios seleccionados en el documento.
  warehouseId: z.string().uuid().nullable().optional(),
  priceListId: z.string().uuid().nullable().optional(),
  vigenciaDias: z.number().int().positive().default(15),
  descuentoGlobalPct: z.number().min(0).max(100).default(0),
  notas: z.string().optional(),
  lines: z.array(lineInputSchema).min(1, 'Agrega al menos una partida'),
});

export type QuoteBody = z.infer<typeof quoteBodySchema>;

// ===== Fechas / estado =====

/** Fecha (yyyy-mm-dd) de hoy en el servidor. */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `valid_until` = hoy + vigenciaDias, como yyyy-mm-dd. */
export function validUntilFrom(vigenciaDias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + vigenciaDias);
  return d.toISOString().slice(0, 10);
}

/**
 * Estado a MOSTRAR (solo display): una cotización 'enviada' cuya `valid_until`
 * ya pasó se reporta como 'vencida' sin tocar la BD.
 */
export function displayStatus(status: QuoteStatus, validUntil: string | null): QuoteStatus {
  if (status === 'enviada' && validUntil && validUntil < todayStr()) return 'vencida';
  return status;
}

/** 409 si el estado actual no permite la transición solicitada. */
export function assertStatus(current: QuoteStatus, expected: QuoteStatus, message: string): void {
  if (current !== expected) throw new ApiError(409, message);
}

// ===== Mapeos a camelCase =====

/** Subconjunto de columnas de `quotes` que consumen los mapeos + el join. */
export type QuoteHeaderRow = Pick<
  Tables<'quotes'>,
  | 'id'
  | 'folio'
  | 'customer_id'
  | 'status'
  | 'vigencia_dias'
  | 'valid_until'
  | 'version'
  | 'parent_quote_id'
  | 'descuento_global_pct'
  | 'subtotal'
  | 'tax'
  | 'total'
  | 'warehouse_id'
  | 'price_list_id'
  | 'created_at'
> & { customers: { name: string } | null };

export function mapQuoteRow(r: QuoteHeaderRow): QuoteRow {
  return {
    id: r.id,
    folio: r.folio,
    customerId: r.customer_id,
    customerName: r.customers?.name ?? null,
    status: displayStatus(r.status, r.valid_until),
    vigenciaDias: r.vigencia_dias,
    validUntil: r.valid_until,
    version: r.version,
    parentQuoteId: r.parent_quote_id,
    descuentoGlobalPct: Number(r.descuento_global_pct),
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    warehouseId: r.warehouse_id,
    priceListId: r.price_list_id,
    createdAt: r.created_at,
  };
}

export function toDocLine(it: Tables<'quote_items'>): DocLine {
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

/** Filas de `quote_items` a insertar a partir de partidas ya calculadas. */
export function itemInsertsFor(
  quoteId: string,
  organizationId: string,
  lines: DocLine[],
): TablesInsert<'quote_items'>[] {
  return lines.map((l) => ({
    quote_id: quoteId,
    organization_id: organizationId,
    product_variant_id: l.productVariantId,
    sku: l.sku,
    name: l.name,
    qty: l.qty,
    unit_price: l.unitPrice,
    discount_pct: l.discountPct,
    iva_rate: l.ivaRate,
    line_total: l.lineTotal,
  }));
}

/** Carga el detalle completo (cabecera + partidas + nombre de cliente). */
export async function loadQuoteDetail(supabase: ErpClient, id: string): Promise<QuoteDetail> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*, customers ( name ), quote_items ( * )')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Cotización no encontrada');

  const items = (data.quote_items ?? [])
    .map(toDocLine)
    .sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));

  return {
    ...mapQuoteRow(data),
    notas: data.notas,
    custom: (data.custom ?? {}) as Record<string, unknown>,
    items,
  };
}
