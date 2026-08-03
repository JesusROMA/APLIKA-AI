import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import {
  updatePoSchema,
  buildPoLines,
  computePoTotals,
  poItemInsertsFor,
  loadPoDetail,
} from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/purchase-orders/[id] — detalle con partidas (compras/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'ver');
  const supabase = erpClientFor(session);

  return ok(await loadPoDetail(supabase, params.id));
});

// PATCH /api/erp/purchase-orders/[id] — editar notas; partidas sólo en borrador (compras/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'editar');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const { data: current, error: readErr } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Orden de compra no encontrada');

  const body = updatePoSchema.parse(await req.json());

  // Notas siempre editables.
  const header: { notas?: string | null } = {};
  if (body.notas !== undefined) header.notas = body.notas;

  // Las partidas sólo se reconstruyen en borrador.
  if (body.lines) {
    if (current.status !== 'borrador') {
      throw new ApiError(409, 'Sólo se editan las partidas de una OC en borrador');
    }
    const lines = await buildPoLines(supabase, body.lines);
    const totals = computePoTotals(lines);

    const { error: updErr } = await supabase
      .from('purchase_orders')
      .update({
        ...header,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
      })
      .eq('id', params.id);
    if (updErr) throw new ApiError(400, updErr.message);

    const { error: delErr } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('purchase_order_id', params.id);
    if (delErr) throw new ApiError(400, delErr.message);

    const { error: insErr } = await supabase
      .from('purchase_order_items')
      .insert(poItemInsertsFor(params.id, orgId, lines));
    if (insErr) throw new ApiError(400, insErr.message);
  } else if (Object.keys(header).length) {
    const { error: updErr } = await supabase
      .from('purchase_orders')
      .update(header)
      .eq('id', params.id);
    if (updErr) throw new ApiError(400, updErr.message);
  }

  return ok(await loadPoDetail(supabase, params.id));
});
