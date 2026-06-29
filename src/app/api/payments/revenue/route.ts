import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/payments/revenue — ingresos por día (últimos 14 días) para las barras.
export const GET = handle(async () => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const days = 14;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('payments')
    .select('amount, created_at')
    .eq('status', 'exitoso')
    .gte('created_at', since);
  if (error) throw error;

  const buckets = new Array(days).fill(0);
  const start = Date.now() - days * 86400000;
  for (const p of data ?? []) {
    const idx = Math.min(days - 1, Math.floor((new Date((p as any).created_at).getTime() - start) / 86400000));
    if (idx >= 0) buckets[idx] += Number((p as any).amount);
  }
  const max = Math.max(1, ...buckets);
  // Alturas en % listas para las barras de la UI
  const bars = buckets.map((v) => `${Math.max(4, Math.round((v / max) * 100))}%`);

  return ok({ series: buckets, bars, max });
});
