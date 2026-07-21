import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadOrderDetail } from '@/app/api/erp/orders/_shared';
import type { Json } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

const Body = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        qty: z.number().positive('La cantidad a entregar debe ser mayor a 0'),
      }),
    )
    .min(1, 'Indica al menos una partida a entregar'),
});

// POST /api/erp/orders/[id]/deliver — registra entrega por partida (ordenes/editar).
// La RPC `record_delivery` fija el estado surtido_parcial/surtido y afecta inventario.
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'ordenes', 'editar');
  const supabase = erpClientFor(session);
  const b = Body.parse(await req.json());

  const p_lines = b.lines.map((l) => ({ item_id: l.itemId, qty: Math.round(l.qty) })) as Json;

  const { error } = await supabase.rpc('record_delivery', {
    p_order_id: params.id,
    p_lines,
  });
  if (error) {
    throw new ApiError(error.code === '42501' ? 403 : 400, error.message);
  }

  return ok(await loadOrderDetail(supabase, params.id));
});
