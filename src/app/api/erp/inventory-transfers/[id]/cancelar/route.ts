import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { cancelTransferSchema, loadTransferDetail, transferRpcError } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/inventory-transfers/[id]/cancelar — cancela un traspaso (inventario/cancelar).
// La RPC `cancelar_traspaso` solo permite cancelar desde 'borrador' (P0001 → 409 si no).
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'cancelar');
  const supabase = erpClientFor(session);

  const { motivo } = cancelTransferSchema.parse(await req.json().catch(() => ({})));

  const { error } = await supabase.rpc('cancelar_traspaso', {
    p_transfer: params.id,
    p_motivo: motivo ?? '',
  });
  if (error) throw transferRpcError(error);

  return ok(await loadTransferDetail(supabase, params.id));
});
