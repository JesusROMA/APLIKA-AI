import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import {
  updateReqSchema,
  buildReqLines,
  reqItemInsertsFor,
  loadReqDetail,
} from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/requisitions/[id] — detalle con partidas (compras/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'ver');
  const supabase = erpClientFor(session);

  return ok(await loadReqDetail(supabase, params.id));
});

// PATCH /api/erp/requisitions/[id] — editar notas; partidas sólo en borrador (compras/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'editar');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const { data: current, error: readErr } = await supabase
    .from('requisitions')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Requisición no encontrada');

  const body = updateReqSchema.parse(await req.json());

  // Notas siempre editables.
  const header: { notas?: string | null } = {};
  if (body.notas !== undefined) header.notas = body.notas;

  // Las partidas sólo se reconstruyen en borrador.
  if (body.lines) {
    if (current.status !== 'borrador') {
      throw new ApiError(409, 'Sólo se editan las partidas de una requisición en borrador');
    }
    const lines = await buildReqLines(supabase, body.lines);

    if (Object.keys(header).length) {
      const { error: updErr } = await supabase
        .from('requisitions')
        .update(header)
        .eq('id', params.id);
      if (updErr) throw new ApiError(400, updErr.message);
    }

    const { error: delErr } = await supabase
      .from('requisition_items')
      .delete()
      .eq('requisition_id', params.id);
    if (delErr) throw new ApiError(400, delErr.message);

    const { error: insErr } = await supabase
      .from('requisition_items')
      .insert(reqItemInsertsFor(params.id, orgId, lines));
    if (insErr) throw new ApiError(400, insErr.message);
  } else if (Object.keys(header).length) {
    const { error: updErr } = await supabase
      .from('requisitions')
      .update(header)
      .eq('id', params.id);
    if (updErr) throw new ApiError(400, updErr.message);
  }

  return ok(await loadReqDetail(supabase, params.id));
});
