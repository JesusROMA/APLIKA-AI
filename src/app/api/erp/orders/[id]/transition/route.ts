import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadOrderDetail } from '@/app/api/erp/orders/_shared';

export const dynamic = 'force-dynamic';

const Body = z.object({
  status: z.enum([
    'borrador',
    'confirmado',
    'pagado',
    'surtido_parcial',
    'surtido',
    'facturado',
    'enviado',
    'cancelada',
  ]),
});

// POST /api/erp/orders/[id]/transition — avanza el pedido por el pipeline (ordenes/editar).
// La RPC `transition_order` valida permisos y transiciones válidas.
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'ordenes', 'editar');
  const supabase = erpClientFor(session);
  const { status } = Body.parse(await req.json());

  const { error } = await supabase.rpc('transition_order', {
    p_order_id: params.id,
    p_new: status,
  });
  if (error) {
    throw new ApiError(error.code === '42501' ? 403 : 400, error.message);
  }

  return ok(await loadOrderDetail(supabase, params.id));
});
