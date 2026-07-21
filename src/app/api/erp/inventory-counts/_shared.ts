import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import type { FolioDocType } from '@/lib/erp/folios';
import type { CountDetail, CountItem, CountStatus } from '@/lib/types/erp-inventario';

/**
 * Piezas compartidas del submódulo CONTEOS (namespace ERP
 * `/api/erp/inventory-counts`). Solo las consumen los endpoints de este subárbol
 * (propiedad de AGENTE-CONTEOS); NO forman parte de la superficie del orquestador.
 */

/** docType para `nextSerieFolio` de conteos físicos (serie CONT). */
export const COUNT_DOC_TYPE: FolioDocType = 'count';

/** Primer elemento de una relación embebida to-one (objeto o arreglo). */
function firstOf<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/** Nombre de una relación embebida to-one (objeto o arreglo). */
export function relName(rel: unknown): string | null {
  const v = firstOf(rel as { name?: string | null } | { name?: string | null }[] | null);
  return v?.name ?? null;
}

/** SKU de la variante embebida (o null). */
export function variantSku(rel: unknown): string | null {
  const v = firstOf(rel as { sku?: string | null } | { sku?: string | null }[] | null);
  return v?.sku ?? null;
}

/** Nombre legible "Producto · Variante" desde la variante embebida. */
export function variantName(rel: unknown): string {
  const v = firstOf(
    rel as
      | { name?: string | null; products?: unknown }
      | { name?: string | null; products?: unknown }[]
      | null,
  );
  if (!v) return '—';
  const p = firstOf(v.products as { name?: string | null } | { name?: string | null }[] | null);
  const vName = v.name ?? '';
  const pName = p?.name ?? '';
  if (pName && vName) return `${pName} · ${vName}`;
  return pName || vName || '—';
}

/** Diferencia contado − sistema (null si aún no se cuenta). */
export function diffOf(systemQty: number, countedQty: number | null): number | null {
  return countedQty == null ? null : countedQty - systemQty;
}

const COUNT_SELECT =
  'id, folio, warehouse_id, status, created_at, applied_at, notas, warehouses ( name )';

const ITEM_SELECT =
  'id, product_variant_id, system_qty, counted_qty, product_variants ( sku, name, products ( name ) )';

/**
 * Conteo de partidas por conteo (para el `itemCount` del listado). Una sola
 * consulta sobre las ids de la página; se tallan en memoria.
 */
export async function countItemsByCount(
  supabase: ErpClient,
  ids: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from('inventory_count_items')
    .select('count_id')
    .in('count_id', ids);
  if (error) throw error;
  for (const r of data ?? []) out[r.count_id] = (out[r.count_id] ?? 0) + 1;
  return out;
}

/** Carga el detalle completo de un conteo (cabecera + partidas). 404 si no existe. */
export async function loadCountDetail(supabase: ErpClient, id: string): Promise<CountDetail> {
  const { data: c, error } = await supabase
    .from('inventory_counts')
    .select(COUNT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!c) throw new ApiError(404, 'Conteo no encontrado');

  const { data: rows, error: iErr } = await supabase
    .from('inventory_count_items')
    .select(ITEM_SELECT)
    .eq('count_id', id)
    .order('id');
  if (iErr) throw iErr;

  const items: CountItem[] = (rows ?? []).map((r) => {
    const systemQty = Number(r.system_qty);
    const countedQty = r.counted_qty == null ? null : Number(r.counted_qty);
    return {
      id: r.id,
      productVariantId: r.product_variant_id,
      sku: variantSku(r.product_variants),
      name: variantName(r.product_variants),
      systemQty,
      countedQty,
      diff: diffOf(systemQty, countedQty),
    };
  });

  return {
    id: c.id,
    folio: c.folio,
    warehouseId: c.warehouse_id,
    warehouseName: relName(c.warehouses),
    status: c.status as CountStatus,
    createdAt: c.created_at,
    appliedAt: c.applied_at,
    notas: c.notas,
    itemCount: items.length,
    items,
  };
}
