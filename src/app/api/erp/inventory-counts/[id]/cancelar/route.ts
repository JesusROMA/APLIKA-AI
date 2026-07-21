import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadCountDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/inventory-counts/[id]/cancelar — cancela el conteo (inventario/cancelar).
// Sin RPC: update directo bajo RLS. No se puede cancelar si ya está aplicado.
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'cancelar');
  const supabase = erpClientFor(session);

  const { data: current, error: readErr } = await supabase
    .from('inventory_counts')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Conteo no encontrado');
  if (current.status === 'aplicado') {
    throw new ApiError(409, 'No se puede cancelar un conteo ya aplicado');
  }

  if (current.status !== 'cancelada') {
    const { error: updErr } = await supabase
      .from('inventory_counts')
      .update({ status: 'cancelada' })
      .eq('id', params.id);
    if (updErr) throw new ApiError(400, updErr.message);
  }

  return ok(await loadCountDetail(supabase, params.id));
});
