import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import type { KardexRow } from '@/lib/types/erp-inventario';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, created_at, type, qty, unit_cost, avg_cost_after, balance_after, reason, ref_type';

// GET /api/erp/inventory/kardex?variantId=&warehouseId= — kardex de una variante
// (opcionalmente acotado a un almacén), ordenado por fecha desc y paginado
// (inventario/ver). `qty` ya viene con signo desde inventory_movements.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'ver');
  const supabase = erpClientFor(session);

  const url = new URL(req.url);
  const variantId = url.searchParams.get('variantId');
  if (!variantId) throw new ApiError(400, 'variantId es requerido');
  const warehouseId = url.searchParams.get('warehouseId') || undefined;

  const { page, pageSize } = parseListParams(url);
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase
    .from('inventory_movements')
    .select(SELECT, { count: 'exact' })
    .eq('product_variant_id', variantId);
  if (warehouseId) q = q.eq('warehouse_id', warehouseId);

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows: KardexRow[] = (data ?? []).map((r) => ({
    id: r.id,
    date: r.created_at,
    type: r.type,
    qty: Number(r.qty),
    unitCost: r.unit_cost == null ? null : Number(r.unit_cost),
    avgCostAfter: r.avg_cost_after == null ? null : Number(r.avg_cost_after),
    balanceAfter: r.balance_after == null ? null : Number(r.balance_after),
    reason: r.reason,
    refType: r.ref_type,
  }));
  return ok(paginated(rows, page, pageSize, count));
});
