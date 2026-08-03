import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadEntryDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/entry-orders/[id]/cancelar — → cancelada (inventario/cancelar).
// Sólo desde 'borrador'; una OE 'aplicada' ya afectó inventario y no se cancela.
// Update directo bajo RLS.
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'cancelar');
  const supabase = erpClientFor(session);

  const { data: current, error: readErr } = await supabase
    .from('entry_orders')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Orden de entrada no encontrada');
  if (current.status === 'cancelada') {
    throw new ApiError(409, 'La orden de entrada ya está cancelada');
  }
  if (current.status !== 'borrador') {
    throw new ApiError(409, 'No se puede cancelar una orden de entrada ya aplicada');
  }

  const { error: updErr } = await supabase
    .from('entry_orders')
    .update({ status: 'cancelada' })
    .eq('id', params.id);
  if (updErr) throw new ApiError(400, updErr.message);

  return ok(await loadEntryDetail(supabase, params.id));
});
