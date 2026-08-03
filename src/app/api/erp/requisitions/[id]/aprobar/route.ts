import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadReqDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/requisitions/[id]/aprobar — borrador → aprobada (compras/editar)
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'editar');
  const supabase = erpClientFor(session);

  const { error } = await supabase.rpc('aprobar_requisicion', { p_req: params.id });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, error.message);
    if (error.code === 'P0001') throw new ApiError(409, error.message);
    throw new ApiError(400, error.message);
  }

  return ok(await loadReqDetail(supabase, params.id));
});
