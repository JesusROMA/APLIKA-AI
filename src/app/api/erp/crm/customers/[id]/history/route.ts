import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { CustomerHistory, CustomerHistoryDoc } from '@/lib/types/erp-crm';

export const dynamic = 'force-dynamic';

interface DocRow {
  id: string;
  folio: string;
  status: string;
  total: number;
  created_at: string;
}

function toDoc(type: CustomerHistoryDoc['type']) {
  return (d: DocRow): CustomerHistoryDoc => ({
    type,
    id: d.id,
    folio: d.folio,
    status: d.status,
    total: Number(d.total),
    date: d.created_at,
  });
}

// GET /api/erp/crm/customers/[id]/history — vista 360 (crm/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'crm', 'ver');
  const supabase = erpClientFor(session);

  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, balance')
    .eq('id', params.id)
    .maybeSingle();
  if (custErr) throw custErr;
  if (!customer) throw new ApiError(404, 'Cliente no encontrado');

  // Documentos del cliente (RLS aplica). Se leen las tres tablas en paralelo.
  const [quotes, orders, invoices] = await Promise.all([
    supabase
      .from('quotes')
      .select('id, folio, status, total, created_at')
      .eq('customer_id', params.id),
    supabase
      .from('orders')
      .select('id, folio, status, total, created_at')
      .eq('customer_id', params.id),
    supabase
      .from('invoices')
      .select('id, folio, status, total, created_at')
      .eq('customer_id', params.id),
  ]);
  if (quotes.error) throw quotes.error;
  if (orders.error) throw orders.error;
  if (invoices.error) throw invoices.error;

  const docs: CustomerHistoryDoc[] = [
    ...(quotes.data ?? []).map(toDoc('cotizacion')),
    ...(orders.data ?? []).map(toDoc('pedido')),
    ...(invoices.data ?? []).map(toDoc('factura')),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const history: CustomerHistory = {
    customerId: customer.id,
    balance: Number(customer.balance),
    docs,
  };
  return ok(history);
});
