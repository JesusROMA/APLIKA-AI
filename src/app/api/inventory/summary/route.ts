import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { fetchInventoryRows, summarize } from '@/lib/modules/inventory';

export const dynamic = 'force-dynamic';

// GET /api/inventory/summary
export const GET = handle(async () => {
  await requireTenant();
  const rows = await fetchInventoryRows();
  return ok(summarize(rows));
});
