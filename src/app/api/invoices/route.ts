import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { dateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

// GET /api/invoices?status={facFilter}
// Devuelve las facturas en la misma forma que el frontend (this.facturas).
export const GET = handle(async (req) => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const status = new URL(req.url).searchParams.get('status') ?? 'todas';

  let query = supabase
    .from('invoices')
    .select('id, serie, folio, uuid, regimen, uso_cfdi, subtotal, tax, total, status, created_at, orders ( folio )')
    .order('created_at', { ascending: false });
  if (status && status !== 'todas') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;

  const invoices = (data ?? []).map((f: any) => ({
    id: f.id,
    serie: f.serie,
    folio: f.folio,
    uuid: f.uuid,
    regimen: f.regimen,
    uso: f.uso_cfdi,
    date: dateLong(f.created_at),
    totalNum: Number(f.total),
    status: f.status,
    pedido: f.orders?.folio ?? '',
  }));

  return ok({ invoices });
});
