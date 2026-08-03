import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import {
  updateEntrySchema,
  buildEntryItems,
  entryItemInsertsFor,
  loadEntryDetail,
} from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/entry-orders/[id] — detalle con partidas (inventario/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'ver');
  const supabase = erpClientFor(session);

  return ok(await loadEntryDetail(supabase, params.id));
});

// PATCH /api/erp/entry-orders/[id] — editar notas; partidas sólo en borrador (inventario/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'editar');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const { data: current, error: readErr } = await supabase
    .from('entry_orders')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Orden de entrada no encontrada');

  const body = updateEntrySchema.parse(await req.json());

  // Notas siempre editables.
  const header: { notas?: string | null } = {};
  if (body.notas !== undefined) header.notas = body.notas;

  // Las partidas sólo se reconstruyen en borrador.
  if (body.items) {
    if (current.status !== 'borrador') {
      throw new ApiError(409, 'Sólo se editan las partidas de una OE en borrador');
    }
    const items = await buildEntryItems(supabase, body.items);

    if (Object.keys(header).length) {
      const { error: updErr } = await supabase
        .from('entry_orders')
        .update(header)
        .eq('id', params.id);
      if (updErr) throw new ApiError(400, updErr.message);
    }

    const { error: delErr } = await supabase
      .from('entry_order_items')
      .delete()
      .eq('entry_order_id', params.id);
    if (delErr) throw new ApiError(400, delErr.message);

    const { error: insErr } = await supabase
      .from('entry_order_items')
      .insert(entryItemInsertsFor(params.id, orgId, items));
    if (insErr) throw new ApiError(400, insErr.message);
  } else if (Object.keys(header).length) {
    const { error: updErr } = await supabase
      .from('entry_orders')
      .update(header)
      .eq('id', params.id);
    if (updErr) throw new ApiError(400, updErr.message);
  }

  return ok(await loadEntryDetail(supabase, params.id));
});
