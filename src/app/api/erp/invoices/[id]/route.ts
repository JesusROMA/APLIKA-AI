import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadInvoiceDetail } from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/invoices/[id] — detalle con partidas, pagos y remisiones ligadas
// (facturacion/ver).
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'ver');
  const supabase = erpClientFor(session);

  const detail = await loadInvoiceDetail(supabase, params.id);
  return ok(detail);
});
