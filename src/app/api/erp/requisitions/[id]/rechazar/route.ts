import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { rejectReqSchema, loadReqDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/requisitions/[id]/rechazar — borrador/aprobada → rechazada (compras/editar)
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'editar');
  const supabase = erpClientFor(session);

  // El motivo es informativo; se anexa a las notas si viene.
  const body = rejectReqSchema.parse(await req.json().catch(() => ({})));

  const { data: current, error: readErr } = await supabase
    .from('requisitions')
    .select('id, status, notas')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Requisición no encontrada');

  if (current.status !== 'borrador' && current.status !== 'aprobada') {
    throw new ApiError(409, 'Sólo se rechazan requisiciones en borrador o aprobadas');
  }

  const motivo = body.motivo?.trim();
  const notas = motivo
    ? [current.notas, `Rechazada: ${motivo}`].filter(Boolean).join('\n')
    : current.notas;

  const { error } = await supabase
    .from('requisitions')
    .update({ status: 'rechazada', notas })
    .eq('id', params.id);
  if (error) throw new ApiError(400, error.message);

  return ok(await loadReqDetail(supabase, params.id));
});
