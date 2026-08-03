import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { assertTransition, loadAppointmentDetail, statusSchema } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/appointments/[id]/estado — cambia el estado de la cita.
// Requiere 'editar', salvo cuando el destino es 'cancelada' ⇒ 'cancelar'.
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  const { status } = statusSchema.parse(await req.json());
  requireAccess(session, 'calendario', status === 'cancelada' ? 'cancelar' : 'editar');
  const supabase = erpClientFor(session);

  const { data: current, error: curErr } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (curErr) throw new ApiError(400, curErr.message);
  if (!current) throw new ApiError(404, 'Cita no encontrada');

  assertTransition(current.status, status);

  const { error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', params.id);
  if (error) throw new ApiError(400, error.message);

  return ok(await loadAppointmentDetail(supabase, params.id));
});
