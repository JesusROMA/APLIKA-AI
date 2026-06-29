import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { money, dateShort } from '@/lib/format';

export const dynamic = 'force-dynamic';

// GET /api/payments — lista de pagos (Stripe) para la tabla del módulo Pagos.
export const GET = handle(async () => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payments')
    .select('stripe_charge_id, stripe_payment_intent_id, method, amount, status, created_at, orders ( folio ), customers ( name )')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const payments = (data ?? []).map((p: any) => ({
    id: p.stripe_charge_id ?? p.stripe_payment_intent_id ?? '—',
    client: p.customers?.name ?? '—',
    pedido: p.orders?.folio ?? '—',
    metodo: p.method ?? '',
    date: dateShort(p.created_at),
    amount: money(Number(p.amount)),
    status: p.status, // la UI deriva label/badge
  }));

  return ok({ payments });
});
