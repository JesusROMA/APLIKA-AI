import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadPoDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/purchase-orders/[id]/confirmar — borrador → confirmada (compras/editar)
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'editar');
  const supabase = erpClientFor(session);

  const { data: current, error: readErr } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Orden de compra no encontrada');
  if (current.status !== 'borrador') {
    throw new ApiError(409, 'Sólo se confirma una OC en borrador');
  }

  const { error: updErr } = await supabase
    .from('purchase_orders')
    .update({ status: 'confirmada' })
    .eq('id', params.id);
  if (updErr) throw new ApiError(400, updErr.message);

  return ok(await loadPoDetail(supabase, params.id));
});
