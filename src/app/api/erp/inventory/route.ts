import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import type { Tables } from '@/lib/supabase/database.types';
import type { StockRow } from '@/lib/types/erp-inventario';

export const dynamic = 'force-dynamic';

// Existencias (fila de inventory) + join a variante/producto/almacén para el mapeo.
const SELECT =
  'id, stock, avg_cost, min_stock, max_stock, product_variant_id, warehouse_id, ' +
  'product_variants!inner ( sku, name, products ( name ) ), warehouses ( name )';

type InventoryJoinRow = Pick<
  Tables<'inventory'>,
  'id' | 'stock' | 'avg_cost' | 'min_stock' | 'max_stock' | 'product_variant_id' | 'warehouse_id'
> & {
  product_variants: { sku: string; name: string; products: { name: string } | null } | null;
  warehouses: { name: string } | null;
};

function mapStockRow(r: InventoryJoinRow): StockRow {
  const stock = Number(r.stock);
  const avgCost = Number(r.avg_cost);
  return {
    variantId: r.product_variant_id,
    sku: r.product_variants?.sku ?? '',
    name: r.product_variants?.name ?? '',
    productName: r.product_variants?.products?.name ?? '',
    warehouseId: r.warehouse_id,
    warehouseName: r.warehouses?.name ?? '',
    stock,
    avgCost,
    value: stock * avgCost,
    minStock: Number(r.min_stock),
    maxStock: Number(r.max_stock),
  };
}

// GET /api/erp/inventory — existencias paginadas (inventario/ver).
// Filtro `search` (sku o nombre de variante) y `warehouseId` opcional.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'ver');
  const supabase = erpClientFor(session);

  const url = new URL(req.url);
  const { page, pageSize, search } = parseListParams(url);
  const warehouseId = url.searchParams.get('warehouseId') || undefined;
  const [from, to] = rangeFor(page, pageSize);

  // La búsqueda es por sku/nombre de la variante: resolvemos ids del maestro y
  // filtramos por `product_variant_id.in(...)` (mismo patrón que quotes).
  let variantIds: string[] | null = null;
  if (search) {
    const { data: variants, error: vErr } = await supabase
      .from('product_variants')
      .select('id')
      .or(`sku.ilike.%${search}%,name.ilike.%${search}%`);
    if (vErr) throw vErr;
    variantIds = (variants ?? []).map((v) => v.id);
    if (variantIds.length === 0) return ok(paginated<StockRow>([], page, pageSize, 0));
  }

  let q = supabase.from('inventory').select(SELECT, { count: 'exact' });
  if (warehouseId) q = q.eq('warehouse_id', warehouseId);
  if (variantIds) q = q.in('product_variant_id', variantIds);

  const { data, error, count } = await q
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as InventoryJoinRow[]).map(mapStockRow);
  return ok(paginated(rows, page, pageSize, count));
});
