import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { fetchDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

const CobrarBody = z.object({
  method: z.enum(['efectivo', 'tarjeta', 'transferencia']),
});

// POST /api/erp/sales-notes/[id]/cobrar — cobra la remisión (remisiones/editar).
// Delega en la RPC `cobrar_remision`, que aplica inventario y pasa a 'cobrada'.
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'remisiones', 'editar');
  const supabase = erpClientFor(session);
  const { method } = CobrarBody.parse(await req.json());

  const { error } = await supabase.rpc('cobrar_remision', {
    p_id: params.id,
    p_method: method,
  });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, error.message);
    throw new ApiError(400, error.message);
  }

  const detail = await fetchDetail(supabase, params.id);
  if (!detail) throw new ApiError(404, 'Remisión no encontrada');
  return ok(detail);
});
