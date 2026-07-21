import type { ProductRow, VariantRow } from '@/lib/types/erp';
import type { ErpClient } from '@/lib/erp/db';

export const PRODUCT_SELECT =
  'id, name, category, description, tipo, clave_prod_serv, iva_rate, created_at, product_variants ( id, sku, name, base_price_mxn, clave_unidad, attributes )';

export interface RawVariant {
  id: string;
  sku: string;
  name: string;
  base_price_mxn: number;
  clave_unidad: string;
  attributes: unknown;
}

export interface RawProduct {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  tipo: string;
  clave_prod_serv: string | null;
  iva_rate: number;
  created_at: string;
  product_variants: RawVariant[];
}

/** Suma de stock por variante (todos los almacenes) para las variantes dadas. */
export async function stockByVariant(
  supabase: ErpClient,
  variantIds: string[],
): Promise<Record<string, number>> {
  if (variantIds.length === 0) return {};
  const { data, error } = await supabase
    .from('inventory')
    .select('product_variant_id, stock')
    .in('product_variant_id', variantIds);
  if (error) throw error;
  const acc: Record<string, number> = {};
  for (const r of data ?? []) {
    acc[r.product_variant_id] = (acc[r.product_variant_id] ?? 0) + Number(r.stock);
  }
  return acc;
}

/** Mapea un producto crudo (con variantes embebidas) a `ProductRow` (C2). */
export function toProductRow(p: RawProduct, stock: Record<string, number>): ProductRow {
  const variants: VariantRow[] = (p.product_variants ?? []).map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name ?? null,
    basePriceMxn: Number(v.base_price_mxn),
    claveUnidad: v.clave_unidad,
    attributes: (v.attributes ?? {}) as Record<string, unknown>,
    stockTotal: stock[v.id] ?? 0,
  }));
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description,
    tipo: p.tipo === 'servicio' ? 'servicio' : 'producto',
    claveProdServ: p.clave_prod_serv,
    ivaRate: Number(p.iva_rate),
    variants,
    createdAt: p.created_at,
  };
}
