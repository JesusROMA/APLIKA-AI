import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { fetchInventoryRows } from '@/lib/modules/inventory';
import { semaforo } from '@/lib/format';

export const dynamic = 'force-dynamic';

// GET /api/inventory/alerts — productos por agotarse (stock < mínimo)
export const GET = handle(async () => {
  await requireTenant();
  const rows = await fetchInventoryRows();
  const alerts = rows
    .filter((r) => semaforo(r.stock, r.min) !== 'ok')
    .map((r) => ({ name: r.name, wh: r.wh, min: String(r.min), stock: String(r.stock) }));
  return ok({ alerts, count: `${alerts.length} activas` });
});
