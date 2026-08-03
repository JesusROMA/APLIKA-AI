import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { entryRpcError, loadEntryDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/entry-orders/[id]/aplicar — postea la ENTRADA a inventario con costo (inventario/editar).
// La RPC `aplicar_entrada` sube existencias + costo promedio (F2), fija status en
// 'aplicada' y actualiza la OC ligada. Autoridad: RLS (42501→403) + RAISE de
// negocio (estado inválido → 409).
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'editar');
  const supabase = erpClientFor(session);

  const { error } = await supabase.rpc('aplicar_entrada', { p_eo: params.id });
  if (error) throw entryRpcError(error);

  return ok(await loadEntryDetail(supabase, params.id));
});
