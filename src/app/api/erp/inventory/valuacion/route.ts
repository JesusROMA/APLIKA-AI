import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { ValuationRow } from '@/lib/types/erp-inventario';

export const dynamic = 'force-dynamic';

type ValuationJoinRow = {
  stock: number;
  avg_cost: number;
  warehouse_id: string;
  warehouses: { name: string } | null;
};

// GET /api/erp/inventory/valuacion — valuación por almacén (inventario/ver).
// Un solo query sobre inventory + agregación en JS:
//   skuCount = variantes con stock ≠ 0 · units = Σ stock · value = Σ stock*avgCost.
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('inventory')
    .select('stock, avg_cost, warehouse_id, warehouses ( name )');
  if (error) throw error;

  const byWarehouse = new Map<string, ValuationRow>();
  for (const r of (data ?? []) as unknown as ValuationJoinRow[]) {
    const stock = Number(r.stock);
    let row = byWarehouse.get(r.warehouse_id);
    if (!row) {
      row = {
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouses?.name ?? '',
        skuCount: 0,
        units: 0,
        value: 0,
      };
      byWarehouse.set(r.warehouse_id, row);
    }
    if (stock !== 0) row.skuCount += 1;
    row.units += stock;
    row.value += stock * Number(r.avg_cost);
  }

  const rows = Array.from(byWarehouse.values()).sort((a, b) =>
    a.warehouseName.localeCompare(b.warehouseName, 'es'),
  );
  const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
  return ok({ data: rows, totalValue });
});
