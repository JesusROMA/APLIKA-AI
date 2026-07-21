import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { fetchDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

const CancelBody = z.object({
  motivo: z.string().trim().min(1, 'El motivo es obligatorio'),
});

// POST /api/erp/sales-notes/[id]/cancelar — cancela (soft) desde 'abierta'
// (remisiones/cancelar). Una remisión cobrada/facturada ya no puede cancelarse.
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'remisiones', 'cancelar');
  const supabase = erpClientFor(session);
  const { motivo } = CancelBody.parse(await req.json());

  const { data: cur, error: curErr } = await supabase
    .from('sales_notes')
    .select('status')
    .eq('id', params.id)
    .maybeSingle();
  if (curErr) throw curErr;
  if (!cur) throw new ApiError(404, 'Remisión no encontrada');
  if (cur.status === 'cancelada') {
    throw new ApiError(409, 'La remisión ya está cancelada');
  }
  if (cur.status !== 'abierta') {
    throw new ApiError(409, 'No se puede cancelar una remisión cobrada');
  }

  const { error } = await supabase
    .from('sales_notes')
    .update({
      status: 'cancelada',
      cancel_reason: motivo,
      canceled_at: new Date().toISOString(),
    })
    .eq('id', params.id);
  if (error) throw new ApiError(400, error.message);

  const detail = await fetchDetail(supabase, params.id);
  if (!detail) throw new ApiError(404, 'Remisión no encontrada');
  return ok(detail);
});
