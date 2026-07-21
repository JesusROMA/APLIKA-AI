import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadTransferDetail, transferRpcError } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/inventory-transfers/[id]/recibir — en_transito → recibido (inventario/editar).
// La RPC `recibir_traspaso` suma al destino con el costo capturado y avanza el estado.
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'editar');
  const supabase = erpClientFor(session);

  const { error } = await supabase.rpc('recibir_traspaso', { p_transfer: params.id });
  if (error) throw transferRpcError(error);

  return ok(await loadTransferDetail(supabase, params.id));
});
