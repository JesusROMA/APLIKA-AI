import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { computeTotals } from '@/lib/erp/documents';
import { nextSerieFolio } from '@/lib/erp/folios';
import { toDocLine, itemInsertsFor, validUntilFrom } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/quotes/[id]/duplicar — nueva versión en borrador (cotizaciones/crear)
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'cotizaciones', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const { data: source, error: readErr } = await supabase
    .from('quotes')
    .select(
      'id, customer_id, descuento_global_pct, vigencia_dias, version, notas, quote_items ( * )',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!source) throw new ApiError(404, 'Cotización no encontrada');

  const lines = (source.quote_items ?? []).map(toDocLine);
  const descuentoGlobalPct = Number(source.descuento_global_pct);
  const totals = computeTotals(lines, descuentoGlobalPct);

  const folio = await nextSerieFolio(supabase, orgId, 'quote');

  const { data: copy, error: insErr } = await supabase
    .from('quotes')
    .insert({
      organization_id: orgId,
      folio,
      customer_id: source.customer_id,
      status: 'borrador',
      descuento_global_pct: descuentoGlobalPct,
      vigencia_dias: source.vigencia_dias,
      valid_until: validUntilFrom(source.vigencia_dias),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      notas: source.notas,
      version: source.version + 1,
      parent_quote_id: source.id,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (insErr) throw new ApiError(400, insErr.message);

  if (lines.length) {
    const { error: itemsErr } = await supabase
      .from('quote_items')
      .insert(itemInsertsFor(copy.id, orgId, lines));
    if (itemsErr) throw new ApiError(400, itemsErr.message);
  }

  return ok({ id: copy.id }, { status: 201 });
});
