import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { buildLines, computeTotals } from '@/lib/erp/documents';
import { loadQuoteDetail, quoteBodySchema, itemInsertsFor, validUntilFrom } from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/quotes/[id] — detalle con partidas (cotizaciones/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'cotizaciones', 'ver');
  const supabase = erpClientFor(session);

  const detail = await loadQuoteDetail(supabase, params.id);
  return ok(detail);
});

// PATCH /api/erp/quotes/[id] — editar (solo borrador) (cotizaciones/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'cotizaciones', 'editar');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const { data: current, error: readErr } = await supabase
    .from('quotes')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Cotización no encontrada');
  if (current.status !== 'borrador') {
    throw new ApiError(409, 'Solo se editan cotizaciones en borrador');
  }

  const body = quoteBodySchema.parse(await req.json());
  const customerId = body.customerId ?? null;

  // Reconstruye partidas + totales en servidor (lista seleccionada F8).
  const lines = await buildLines(supabase, customerId, body.lines, body.priceListId ?? null);
  const totals = computeTotals(lines, body.descuentoGlobalPct);

  const { error: updErr } = await supabase
    .from('quotes')
    .update({
      customer_id: customerId,
      descuento_global_pct: body.descuentoGlobalPct,
      vigencia_dias: body.vigenciaDias,
      valid_until: validUntilFrom(body.vigenciaDias),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      warehouse_id: body.warehouseId ?? null,
      price_list_id: body.priceListId ?? null,
      notas: body.notas ?? null,
    })
    .eq('id', params.id);
  if (updErr) throw new ApiError(400, updErr.message);

  // Reemplaza las partidas (borra e reinserta).
  const { error: delErr } = await supabase.from('quote_items').delete().eq('quote_id', params.id);
  if (delErr) throw new ApiError(400, delErr.message);
  const { error: insErr } = await supabase
    .from('quote_items')
    .insert(itemInsertsFor(params.id, orgId, lines));
  if (insErr) throw new ApiError(400, insErr.message);

  return ok(await loadQuoteDetail(supabase, params.id));
});
