import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

// GET /api/invoices/summary
export const GET = handle(async () => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('invoices').select('total, status');
  if (error) throw error;
  const rows = data ?? [];
  const count = (s: string) => rows.filter((f: any) => f.status === s).length;
  const monto = rows.filter((f: any) => f.status === 'timbrada').reduce((a: number, f: any) => a + Number(f.total), 0);
  return ok({
    timbradas: count('timbrada'),
    porTimbrar: count('borrador'),
    canceladas: count('cancelada'),
    montoFacturado: money(monto),
  });
});
