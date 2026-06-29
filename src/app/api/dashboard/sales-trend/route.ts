import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/dashboard/sales-trend — serie diaria de ventas (últimos 30 días).
// Devuelve la serie y un "points" listo para el <polyline> 600x170 de la UI.
export const GET = handle(async () => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const days = 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await supabase
    .from('orders')
    .select('total, created_at')
    .gte('created_at', since)
    .neq('status', 'cancelada');
  if (error) throw error;

  // Acumula por día
  const buckets = new Array(days).fill(0);
  const start = Date.now() - days * 86400000;
  for (const o of data ?? []) {
    const idx = Math.min(days - 1, Math.floor((new Date((o as any).created_at).getTime() - start) / 86400000));
    if (idx >= 0) buckets[idx] += Number((o as any).total);
  }

  const max = Math.max(1, ...buckets);
  const W = 600;
  const H = 170;
  const points = buckets
    .map((v, i) => {
      const x = (i / (days - 1)) * W;
      const y = H - (v / max) * (H - 20) - 10;
      return `${x.toFixed(0)},${y.toFixed(0)}`;
    })
    .join(' ');

  return ok({ series: buckets, points, max });
});
