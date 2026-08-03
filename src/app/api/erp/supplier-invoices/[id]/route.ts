import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadSupplierInvoiceDetail } from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/supplier-invoices/[id] — detalle con pagos (compras/ver).
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'ver');
  const supabase = erpClientFor(session);

  const detail = await loadSupplierInvoiceDetail(supabase, params.id);
  return ok(detail);
});
