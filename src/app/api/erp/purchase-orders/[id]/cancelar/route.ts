import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadPoDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/purchase-orders/[id]/cancelar — → cancelada (compras/cancelar).
// Sólo si NO hay recepciones (ninguna partida con qty_received > 0) y no está ya
// cancelada. Update directo bajo RLS.
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'cancelar');
  const supabase = erpClientFor(session);

  const { data: current, error: readErr } = await supabase
    .from('purchase_orders')
    .select('id, status, purchase_order_items ( qty_received )')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Orden de compra no encontrada');
  if (current.status === 'cancelada') {
    throw new ApiError(409, 'La OC ya está cancelada');
  }

  const items = (current.purchase_order_items ?? []) as { qty_received: number }[];
  const hasReceipts = items.some((it) => Number(it.qty_received) > 0);
  if (hasReceipts || current.status === 'recibida' || current.status === 'recibida_parcial') {
    throw new ApiError(409, 'No se puede cancelar una OC con recepciones');
  }

  const { error: updErr } = await supabase
    .from('purchase_orders')
    .update({ status: 'cancelada' })
    .eq('id', params.id);
  if (updErr) throw new ApiError(400, updErr.message);

  return ok(await loadPoDetail(supabase, params.id));
});
