import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPacProvider } from '@/lib/pac';

export const dynamic = 'force-dynamic';

// POST /api/invoices/{id}/cancelar
export const POST = handle(async (_req, { params }) => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const id = params.id;

  const { data: inv, error } = await supabase
    .from('invoices')
    .select('id, uuid, status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!inv) throw new ApiError(404, 'Factura no encontrada');
  if ((inv as any).status !== 'timbrada') throw new ApiError(400, 'Solo se cancelan facturas timbradas');

  const pac = getPacProvider();
  const res = await pac.cancelar((inv as any).uuid);

  const { error: updErr } = await supabase
    .from('invoices')
    .update({ status: 'cancelada', cancelada_at: res.canceladoAt })
    .eq('id', id);
  if (updErr) throw new ApiError(400, updErr.message);

  return ok({ ok: true, canceladoAt: res.canceladoAt });
});
