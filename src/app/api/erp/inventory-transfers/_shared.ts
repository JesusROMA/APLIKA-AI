import { z } from 'zod';
import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import type { Tables, TablesInsert } from '@/lib/supabase/database.types';
import type {
  TransferDetail,
  TransferItem,
  TransferRow,
} from '@/lib/types/erp-inventario';

/**
 * Piezas internas COMPARTIDAS por los endpoints de traspasos (propiedad del
 * submódulo `inventario` · traspasos). No es una route (prefijo `_`): esquemas
 * zod, mapeos a camelCase, carga de detalle y traducción de errores de RPC.
 *
 * Traspaso entre almacenes en 2 pasos: borrador → en_transito (enviar: salida
 * del origen, captura de costo) → recibido (recibir: entrada al destino con el
 * costo que viajó). El movimiento real de inventario lo hacen las RPCs
 * `enviar_traspaso`/`recibir_traspaso` (compartidas del orquestador).
 */

// ===== Validación (zod) =====

/** Partida de traspaso: variante + cantidad ENTERA (qty es INTEGER en BD). */
export const transferItemSchema = z.object({
  productVariantId: z.string().uuid(),
  qty: z.number().int().positive('La cantidad debe ser mayor a 0'),
});

/** Cuerpo de alta: origen ≠ destino y al menos una partida. */
export const createTransferSchema = z
  .object({
    fromWarehouseId: z.string().uuid(),
    toWarehouseId: z.string().uuid(),
    notas: z.string().optional(),
    items: z.array(transferItemSchema).min(1, 'Agrega al menos una partida'),
  })
  .refine((b) => b.fromWarehouseId !== b.toWarehouseId, {
    message: 'El almacén de origen y el de destino deben ser distintos',
    path: ['toWarehouseId'],
  });

export type CreateTransferBody = z.infer<typeof createTransferSchema>;

/** Cuerpo de edición (solo borrador): notas y/o partidas. */
export const updateTransferSchema = z.object({
  notas: z.string().nullable().optional(),
  items: z.array(transferItemSchema).min(1, 'Agrega al menos una partida').optional(),
});

export type UpdateTransferBody = z.infer<typeof updateTransferSchema>;

/** Cuerpo de cancelación: motivo opcional. */
export const cancelTransferSchema = z.object({
  motivo: z.string().optional(),
});

// ===== Folio =====

/**
 * Folio consecutivo para traspasos (serie TRAS). Llama la RPC atómica
 * `next_serie_folio` directamente porque el wrapper compartido
 * `nextSerieFolio` tipa `docType` como `DocType` ('quote'|'order'|'invoice') y
 * aún no admite 'transfer' (reportado al orquestador). La RPC sí acepta
 * `p_doc_type: string`, así que esto es type-safe y no toca lo compartido.
 */
export async function nextTransferFolio(supabase: ErpClient, orgId: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_serie_folio', {
    p_org: orgId,
    p_doc_type: 'transfer',
  });
  if (error) throw error;
  return data as string;
}

// ===== Errores de RPC =====

/**
 * Traduce el error de una RPC de traspaso a `ApiError`:
 *  - 42501 (RLS/permiso) → 403
 *  - P0001 (RAISE del negocio: stock insuficiente / estado inválido) → 409
 *  - resto → 400
 */
export function transferRpcError(error: { code?: string; message: string }): ApiError {
  if (error.code === '42501') return new ApiError(403, error.message);
  if (error.code === 'P0001') return new ApiError(409, error.message);
  return new ApiError(400, error.message);
}

// ===== Mapeos a camelCase =====

/** Columnas de `inventory_transfers` que consumen los mapeos + conteo de items. */
export type TransferHeaderRow = Pick<
  Tables<'inventory_transfers'>,
  | 'id'
  | 'folio'
  | 'from_warehouse_id'
  | 'to_warehouse_id'
  | 'status'
  | 'created_at'
  | 'shipped_at'
  | 'received_at'
> & { inventory_transfer_items: { id: string }[] | null };

/** Mapa `warehouseId → name` para resolver nombres sin ambigüedad de doble FK. */
export type WarehouseNames = Map<string, string>;

/** Nombres de los almacenes referenciados en un conjunto de traspasos. */
export async function warehouseNamesFor(
  supabase: ErpClient,
  ids: string[],
): Promise<WarehouseNames> {
  const map: WarehouseNames = new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error } = await supabase.from('warehouses').select('id, name').in('id', unique);
  if (error) throw error;
  for (const w of data ?? []) map.set(w.id, w.name);
  return map;
}

export function mapTransferRow(r: TransferHeaderRow, names: WarehouseNames): TransferRow {
  return {
    id: r.id,
    folio: r.folio,
    fromWarehouseId: r.from_warehouse_id,
    fromWarehouseName: names.get(r.from_warehouse_id) ?? null,
    toWarehouseId: r.to_warehouse_id,
    toWarehouseName: names.get(r.to_warehouse_id) ?? null,
    status: r.status,
    createdAt: r.created_at,
    shippedAt: r.shipped_at,
    receivedAt: r.received_at,
    itemCount: r.inventory_transfer_items?.length ?? 0,
  };
}

/** Partida cruda con el join a la variante (sku/name). */
type TransferItemRow = Pick<
  Tables<'inventory_transfer_items'>,
  'id' | 'product_variant_id' | 'qty' | 'unit_cost'
> & { product_variants: { sku: string; name: string } | null };

function mapTransferItem(it: TransferItemRow): TransferItem {
  return {
    id: it.id,
    productVariantId: it.product_variant_id,
    sku: it.product_variants?.sku ?? null,
    name: it.product_variants?.name ?? '',
    qty: Number(it.qty),
    unitCost: it.unit_cost == null ? null : Number(it.unit_cost),
  };
}

/** Filas de `inventory_transfer_items` a insertar (unit_cost null hasta enviar). */
export function itemInsertsFor(
  transferId: string,
  organizationId: string,
  items: { productVariantId: string; qty: number }[],
): TablesInsert<'inventory_transfer_items'>[] {
  return items.map((it) => ({
    transfer_id: transferId,
    organization_id: organizationId,
    product_variant_id: it.productVariantId,
    qty: it.qty,
    unit_cost: null,
  }));
}

/** Carga el detalle completo (cabecera + partidas + nombres de almacén). */
export async function loadTransferDetail(supabase: ErpClient, id: string): Promise<TransferDetail> {
  const { data, error } = await supabase
    .from('inventory_transfers')
    .select(
      'id, folio, from_warehouse_id, to_warehouse_id, status, created_at, shipped_at, received_at, notas, inventory_transfer_items ( id, product_variant_id, qty, unit_cost, product_variants ( sku, name ) )',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Traspaso no encontrado');

  const names = await warehouseNamesFor(supabase, [data.from_warehouse_id, data.to_warehouse_id]);
  const itemsRaw = (data.inventory_transfer_items ?? []) as TransferItemRow[];
  const items = itemsRaw
    .map(mapTransferItem)
    .sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));

  const header: TransferHeaderRow = {
    id: data.id,
    folio: data.folio,
    from_warehouse_id: data.from_warehouse_id,
    to_warehouse_id: data.to_warehouse_id,
    status: data.status,
    created_at: data.created_at,
    shipped_at: data.shipped_at,
    received_at: data.received_at,
    inventory_transfer_items: itemsRaw.map((it) => ({ id: it.id })),
  };

  return {
    ...mapTransferRow(header, names),
    notas: data.notas,
    items,
  };
}
