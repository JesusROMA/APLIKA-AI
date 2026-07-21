import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { buildLines, computeTotals } from '@/lib/erp/documents';
import {
  docLineInputSchema,
  assertLinesValid,
  orderItemRows,
  loadOrderDetail,
} from '@/app/api/erp/orders/_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/orders/[id] — detalle con partidas (ordenes/ver).
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'ordenes', 'ver');
  const supabase = erpClientFor(session);
  return ok(await loadOrderDetail(supabase, params.id));
});

const Patch = z.object({
  notes: z.string().nullable().optional(),
  lines: z.array(docLineInputSchema).min(1).optional(),
});

// PATCH /api/erp/orders/[id] — edita notas y (solo en 'borrador') las partidas.
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'ordenes', 'editar');
  const supabase = erpClientFor(session);
  const b = Patch.parse(await req.json());

  const { data: current, error: curErr } = await supabase
    .from('orders')
    .select('id, status, customer_id, organization_id')
    .eq('id', params.id)
    .maybeSingle();
  if (curErr) throw curErr;
  if (!current) throw new ApiError(404, 'Pedido no encontrado');

  if (b.notes !== undefined) {
    const { error } = await supabase.from('orders').update({ notes: b.notes }).eq('id', params.id);
    if (error) throw new ApiError(400, error.message);
  }

  if (b.lines) {
    if (current.status !== 'borrador') {
      throw new ApiError(400, 'Las partidas solo se pueden editar mientras el pedido está en borrador');
    }
    assertLinesValid(b.lines);
    const lines = await buildLines(supabase, current.customer_id, b.lines);
    const totals = computeTotals(lines, 0);

    const { error: headErr } = await supabase
      .from('orders')
      .update({
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        items_count: lines.length,
      })
      .eq('id', params.id);
    if (headErr) throw new ApiError(400, headErr.message);

    const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', params.id);
    if (delErr) throw new ApiError(400, delErr.message);

    const { error: insErr } = await supabase
      .from('order_items')
      .insert(orderItemRows(lines, params.id, current.organization_id));
    if (insErr) throw new ApiError(400, insErr.message);
  }

  return ok(await loadOrderDetail(supabase, params.id));
});
