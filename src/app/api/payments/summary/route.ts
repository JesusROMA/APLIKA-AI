import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

// GET /api/payments/summary
export const GET = handle(async () => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('payments').select('amount, status');
  if (error) throw error;

  const rows = data ?? [];
  const sum = (st: string) => rows.filter((p: any) => p.status === st).reduce((a: number, p: any) => a + Number(p.amount), 0);
  const count = (st: string) => rows.filter((p: any) => p.status === st).length;

  return ok({
    ingresos: money(sum('exitoso')),
    exitosos: count('exitoso'),
    fallidos: count('fallido'),
    reembolsos: money(sum('reembolsado')),
  });
});
