import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { buildLines, computeTotals } from '@/lib/erp/documents';
import { nextSerieFolio } from '@/lib/erp/folios';
import {
  quoteBodySchema,
  mapQuoteRow,
  itemInsertsFor,
  validUntilFrom,
  todayStr,
  type QuoteHeaderRow,
} from './_shared';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, folio, customer_id, status, vigencia_dias, valid_until, version, parent_quote_id, descuento_global_pct, subtotal, tax, total, warehouse_id, price_list_id, created_at, customers ( name )';

/** Estados reales en BD (para filtrar; 'vencida' es display-only). */
const DB_STATUSES = new Set(['borrador', 'enviada', 'aceptada', 'rechazada']);

// GET /api/erp/quotes — listado paginado (cotizaciones/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'cotizaciones', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('quotes').select(SELECT, { count: 'exact' });

  // Filtro por estado. 'vencida' = enviada con vigencia expirada (no es un
  // estado guardado en BD), así que se traduce a un filtro compuesto.
  if (status === 'vencida') {
    q = q.eq('status', 'enviada').lt('valid_until', todayStr());
  } else if (status && DB_STATUSES.has(status)) {
    q = q.eq('status', status as 'borrador' | 'enviada' | 'aceptada' | 'rechazada');
  }

  // Búsqueda por folio o por nombre de cliente (resolviendo ids del maestro).
  if (search) {
    const { data: custs } = await supabase.from('customers').select('id').ilike('name', `%${search}%`);
    const custIds = (custs ?? []).map((c) => c.id);
    const ors = [`folio.ilike.%${search}%`];
    if (custIds.length) ors.push(`customer_id.in.(${custIds.join(',')})`);
    q = q.or(ors.join(','));
  }

  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;

  const rows = ((data ?? []) as QuoteHeaderRow[]).map(mapQuoteRow);
  return ok(paginated(rows, page, pageSize, count));
});

// POST /api/erp/quotes — alta en borrador (cotizaciones/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'cotizaciones', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const body = quoteBodySchema.parse(await req.json());
  const customerId = body.customerId ?? null;

  // Folio + partidas normalizadas + totales, TODO en servidor. El precio se
  // resuelve con la lista SELECCIONADA (F8) → lista del cliente → base.
  const folio = await nextSerieFolio(supabase, orgId, 'quote');
  const lines = await buildLines(supabase, customerId, body.lines, body.priceListId ?? null);
  const totals = computeTotals(lines, body.descuentoGlobalPct);

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      organization_id: orgId,
      folio,
      customer_id: customerId,
      status: 'borrador',
      descuento_global_pct: body.descuentoGlobalPct,
      vigencia_dias: body.vigenciaDias,
      valid_until: validUntilFrom(body.vigenciaDias),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      warehouse_id: body.warehouseId ?? null,
      price_list_id: body.priceListId ?? null,
      notas: body.notas ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  const { error: itemsErr } = await supabase
    .from('quote_items')
    .insert(itemInsertsFor(quote.id, orgId, lines));
  if (itemsErr) throw new ApiError(400, itemsErr.message);

  return ok({ ok: true, id: quote.id }, { status: 201 });
});
