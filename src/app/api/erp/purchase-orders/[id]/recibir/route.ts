import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { receivePoSchema, receiveLinesToRpc, poRpcError, loadPoDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/purchase-orders/[id]/recibir — aplica ENTRADA a inventario con costo (compras/editar).
// La RPC `recibir_compra` suma qty_received, sube el costo promedio (F2) y fija el
// status en recibida_parcial/recibida. Autoridad: RLS + RAISE de negocio.
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'editar');
  const supabase = erpClientFor(session);

  const body = receivePoSchema.parse(await req.json());

  const { error } = await supabase.rpc('recibir_compra', {
    p_po: params.id,
    p_lines: receiveLinesToRpc(body.lines),
  });
  if (error) throw poRpcError(error);

  return ok(await loadPoDetail(supabase, params.id));
});
