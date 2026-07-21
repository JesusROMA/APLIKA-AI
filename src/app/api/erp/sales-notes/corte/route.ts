import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { round2 } from '@/lib/erp/totals';
import type { CorteDelDiaRow } from '@/lib/types/erp-ventas';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/erp/sales-notes/corte?date=YYYY-MM-DD — corte del día (remisiones/ver).
// Agrega las remisiones 'cobrada' de la fecha (por paid_at) por forma de pago.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'remisiones', 'ver');
  const supabase = erpClientFor(session);

  const dateParam = new URL(req.url).searchParams.get('date');
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
  const start = `${date}T00:00:00.000Z`;
  const end = new Date(new Date(start).getTime() + 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('sales_notes')
    .select('payment_method, total')
    .eq('status', 'cobrada')
    .gte('paid_at', start)
    .lt('paid_at', end);
  if (error) throw error;

  const agg = new Map<string, { count: number; total: number }>();
  for (const r of data ?? []) {
    const key = r.payment_method ?? 'sin método';
    const cur = agg.get(key) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(r.total);
    agg.set(key, cur);
  }

  const rows: CorteDelDiaRow[] = [...agg.entries()]
    .map(([paymentMethod, v]) => ({ paymentMethod, count: v.count, total: round2(v.total) }))
    .sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod));

  return ok(rows);
});
