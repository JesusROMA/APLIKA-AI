import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadSeriesDetail } from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/appointment-series/[id] — detalle de serie (calendario/ver).
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'calendario', 'ver');
  const supabase = erpClientFor(session);
  return ok(await loadSeriesDetail(supabase, params.id));
});
