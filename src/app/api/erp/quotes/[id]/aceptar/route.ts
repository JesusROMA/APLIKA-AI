import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadQuoteDetail, assertStatus } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/quotes/[id]/aceptar — enviada → aceptada (cotizaciones/editar)
// La conversión a pedido la realiza la Tanda C; aquí solo cambia el estado.
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'cotizaciones', 'editar');
  const supabase = erpClientFor(session);

  const { data: quote, error: readErr } = await supabase
    .from('quotes')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!quote) throw new ApiError(404, 'Cotización no encontrada');
  assertStatus(quote.status, 'enviada', 'Solo se aceptan cotizaciones enviadas');

  const { error: updErr } = await supabase
    .from('quotes')
    .update({ status: 'aceptada' })
    .eq('id', params.id);
  if (updErr) throw new ApiError(400, updErr.message);

  return ok(await loadQuoteDetail(supabase, params.id));
});
