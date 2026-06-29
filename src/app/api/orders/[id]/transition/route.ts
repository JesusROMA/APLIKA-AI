import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const Body = z.object({
  status: z.enum(['borrador', 'confirmado', 'pagado', 'surtido', 'facturado', 'enviado', 'cancelada']),
});

// POST /api/orders/{id}/transition  { status }
// Avanza el pedido por el pipeline; al llegar a pagado/surtido decrementa stock
// de forma atómica (función transition_order). Admite UUID o folio.
export const POST = handle(async (req, { params }) => {
  await requireTenant();
  const { status } = Body.parse(await req.json());
  const supabase = createSupabaseServerClient();
  const key = decodeURIComponent(params.id);
  const isUuid = /^[0-9a-f-]{36}$/i.test(key);

  let orderId = key;
  if (!isUuid) {
    const { data, error } = await supabase.from('orders').select('id').eq('folio', key).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError(404, 'Pedido no encontrado');
    orderId = (data as any).id;
  }

  const { data, error } = await supabase.rpc('transition_order', {
    p_order_id: orderId,
    p_new: status,
  });
  if (error) throw new ApiError(400, error.message);

  return ok({ ok: true, order: data });
});
