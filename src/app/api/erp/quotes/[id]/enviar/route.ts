import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { getEmailProvider } from '@/lib/email';
import { loadQuoteDetail, assertStatus } from '../../_shared';

export const dynamic = 'force-dynamic';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

// POST /api/erp/quotes/[id]/enviar — borrador → enviada + correo (cotizaciones/editar)
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'cotizaciones', 'editar');
  const supabase = erpClientFor(session);

  const { data: quote, error: readErr } = await supabase
    .from('quotes')
    .select('id, status, folio, total, customer_id, customers ( name, email )')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!quote) throw new ApiError(404, 'Cotización no encontrada');
  assertStatus(quote.status, 'borrador', 'Solo se envían cotizaciones en borrador');

  const customer = quote.customers as { name: string; email: string | null } | null;
  const email = customer?.email ?? null;

  // El correo no bloquea la transición: si el cliente no tiene correo o el
  // proveedor falla, se registra y de todos modos se marca 'enviada'.
  const html =
    `<h2>Cotización ${quote.folio}</h2>` +
    `<p>Hola${customer?.name ? ' ' + customer.name : ''}, adjuntamos tu cotización.</p>` +
    `<p><strong>Total: ${MXN.format(Number(quote.total))}</strong></p>`;
  try {
    await getEmailProvider().send({
      to: email ?? 'sin-correo',
      subject: `Cotización ${quote.folio}`,
      html,
      docType: 'quote',
      docId: params.id,
    });
    if (!email) {
      console.info(`[quotes:enviar] ${quote.folio} sin correo de cliente; no se envió correo real`);
    }
  } catch (e) {
    console.warn(`[quotes:enviar] correo no enviado para ${quote.folio}:`, e);
  }

  const { error: updErr } = await supabase
    .from('quotes')
    .update({ status: 'enviada' })
    .eq('id', params.id);
  if (updErr) throw new ApiError(400, updErr.message);

  return ok(await loadQuoteDetail(supabase, params.id));
});
