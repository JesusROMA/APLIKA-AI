import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';

export const dynamic = 'force-dynamic';

// POST /api/erp/appointment-series/[id]/generar — genera las citas de la serie
// (calendario/crear). La RPC valida permisos y omite empalmes; devuelve nº creadas.
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'calendario', 'crear');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase.rpc('generar_serie', { p_series: params.id });
  if (error) {
    throw new ApiError(error.code === '42501' ? 403 : 400, error.message);
  }

  return ok({ ok: true, creadas: data ?? 0 });
});
