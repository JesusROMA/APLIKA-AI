import { z } from 'zod';
import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import type { Tables, TablesInsert } from '@/lib/supabase/database.types';
import type {
  RequisitionItem,
  RequisitionRow,
  RequisitionDetail,
} from '@/lib/types/erp-compras';

/**
 * Piezas internas COMPARTIDAS por los endpoints de requisiciones (submódulo
 * `compras`). No es una route (prefijo `_`): esquemas zod, normalización de
 * partidas, mapeos a camelCase y carga de detalle.
 *
 * Una requisición es una solicitud interna de compra:
 *   borrador → aprobada → convertida (a Orden de Compra) | rechazada | cancelada.
 * La aprobación la hace la RPC compartida `aprobar_requisicion`.
 */

// ===== Validación (zod) =====

/**
 * Partida de requisición: variante (opcional) + cantidad y costo estimado.
 * Línea libre permitida si trae `name`. Cantidades numeric(14,3); costos
 * numeric(14,4).
 */
export const reqLineSchema = z
  .object({
    productVariantId: z.string().uuid().nullish(),
    sku: z.string().trim().nullish(),
    name: z.string().trim().optional(),
    qty: z.number().positive('La cantidad debe ser mayor a 0'),
    estimatedCost: z.number().min(0, 'El costo estimado no puede ser negativo').optional(),
  })
  .refine((l) => Boolean(l.productVariantId) || Boolean(l.name && l.name.length > 0), {
    message: 'Cada partida requiere un producto o un nombre',
    path: ['name'],
  });

export type ReqLineBody = z.infer<typeof reqLineSchema>;

/** Cuerpo de alta de requisición. */
export const createReqSchema = z.object({
  notas: z.string().nullish(),
  lines: z.array(reqLineSchema).min(1, 'Agrega al menos una partida'),
});

export type CreateReqBody = z.infer<typeof createReqSchema>;

/** Cuerpo de edición: notas siempre; partidas sólo si status 'borrador'. */
export const updateReqSchema = z.object({
  notas: z.string().nullable().optional(),
  lines: z.array(reqLineSchema).min(1, 'Agrega al menos una partida').optional(),
});

export type UpdateReqBody = z.infer<typeof updateReqSchema>;

/** Cuerpo de conversión a Orden de Compra. */
export const convertReqSchema = z.object({
  supplierId: z.string().uuid(),
});

/** Cuerpo de rechazo (motivo opcional, sólo informativo). */
export const rejectReqSchema = z.object({
  motivo: z.string().trim().nullish(),
});

// ===== Normalización de partidas (server) =====

/** Partida ya resuelta en servidor, lista para insertar. */
export interface ReqBuiltLine {
  productVariantId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  estimatedCost: number;
}

/**
 * Resuelve sku/name desde la variante cuando viene `productVariantId`; la línea
 * libre usa el `name` capturado. `estimated_cost` cae a 0 si no viene.
 */
export async function buildReqLines(
  supabase: ErpClient,
  inputs: ReqLineBody[],
): Promise<ReqBuiltLine[]> {
  const out: ReqBuiltLine[] = [];
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
      sku,
      name,
      qty: inp.qty,
      estimatedCost: inp.estimatedCost ?? 0,
    });
  }
  return out;
}

/** Filas de `requisition_items` a insertar. */
export function reqItemInsertsFor(
  requisitionId: string,
  organizationId: string,
  lines: ReqBuiltLine[],
): TablesInsert<'requisition_items'>[] {
  return lines.map((l) => ({
    requisition_id: requisitionId,
    organization_id: organizationId,
    product_variant_id: l.productVariantId,
    sku: l.sku,
    name: l.name,
    qty: l.qty,
    estimated_cost: l.estimatedCost,
  }));
}

// ===== Mapeos a camelCase =====

type ReqHeaderRow = Pick<
  Tables<'requisitions'>,
  'id' | 'folio' | 'status' | 'notas' | 'created_at'
>;

export function mapReqRow(r: ReqHeaderRow, itemCount: number): RequisitionRow {
  return {
    id: r.id,
    folio: r.folio,
    status: r.status,
    notas: r.notas,
    itemCount,
    createdAt: r.created_at,
  };
}

/** Partida cruda de `requisition_items`. */
type ReqItemRow = Pick<
  Tables<'requisition_items'>,
  'id' | 'product_variant_id' | 'sku' | 'name' | 'qty' | 'estimated_cost'
>;

function mapReqItem(it: ReqItemRow): RequisitionItem {
  return {
    id: it.id,
    productVariantId: it.product_variant_id,
    sku: it.sku,
    name: it.name,
    qty: Number(it.qty),
    estimatedCost: Number(it.estimated_cost ?? 0),
  };
}

const DETAIL_SELECT =
  'id, folio, status, notas, created_at, requisition_items ( id, product_variant_id, sku, name, qty, estimated_cost )';

/**
 * Carga el detalle completo (cabecera + partidas). Si la requisición ya está
 * 'convertida', busca la Orden de Compra ligada por trazabilidad (el folio de la
 * requisición se guarda en las notas de la OC al convertir).
 */
export async function loadReqDetail(
  supabase: ErpClient,
  id: string,
): Promise<RequisitionDetail> {
  const { data, error } = await supabase
    .from('requisitions')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Requisición no encontrada');

  const itemsRaw = (data.requisition_items ?? []) as ReqItemRow[];
  const items = itemsRaw
    .map(mapReqItem)
    .sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));

  const header: ReqHeaderRow = {
    id: data.id,
    folio: data.folio,
    status: data.status,
    notas: data.notas,
    created_at: data.created_at,
  };

  let purchaseOrderId: string | null = null;
  if (data.status === 'convertida') {
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('id')
      .ilike('notas', `%${data.folio}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    purchaseOrderId = po?.id ?? null;
  }

  return {
    ...mapReqRow(header, items.length),
    items,
    purchaseOrderId,
  };
}

/** Referencia que se guarda en las notas de la OC para trazar la requisición. */
export function convertNoteFor(folio: string): string {
  return `Generada desde requisición ${folio}`;
}
