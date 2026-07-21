import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { itemInsertsFor, loadTransferDetail, updateTransferSchema } from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/inventory-transfers/[id] — detalle con partidas (inventario/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'ver');
  const supabase = erpClientFor(session);

  return ok(await loadTransferDetail(supabase, params.id));
});

// PATCH /api/erp/inventory-transfers/[id] — editar (solo borrador) (inventario/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'editar');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const { data: current, error: readErr } = await supabase
    .from('inventory_transfers')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Traspaso no encontrado');
  if (current.status !== 'borrador') {
    throw new ApiError(409, 'Solo se editan traspasos en borrador');
  }

  const body = updateTransferSchema.parse(await req.json());

  if (body.notas !== undefined) {
    const { error: updErr } = await supabase
      .from('inventory_transfers')
      .update({ notas: body.notas })
      .eq('id', params.id);
    if (updErr) throw new ApiError(400, updErr.message);
  }

  // Reemplaza las partidas (borra e reinserta) si el body las incluye.
  if (body.items) {
    const { error: delErr } = await supabase
      .from('inventory_transfer_items')
      .delete()
      .eq('transfer_id', params.id);
    if (delErr) throw new ApiError(400, delErr.message);
    const { error: insErr } = await supabase
      .from('inventory_transfer_items')
      .insert(itemInsertsFor(params.id, orgId, body.items));
    if (insErr) throw new ApiError(400, insErr.message);
  }

  return ok(await loadTransferDetail(supabase, params.id));
});
