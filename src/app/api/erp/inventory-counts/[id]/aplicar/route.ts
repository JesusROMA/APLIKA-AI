import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadCountDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/inventory-counts/[id]/aplicar — genera ajustes por diferencias (inventario/editar).
// La RPC `aplicar_conteo` valida permisos, audita y afecta inventario (status → 'aplicado').
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'editar');
  const supabase = erpClientFor(session);

  const { error } = await supabase.rpc('aplicar_conteo', { p_count: params.id });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, error.message);
    // Conflicto de estado (ya aplicado / cancelado / fuera de borrador|en_conteo).
    if (/aplic|cancel|borrador|en_conteo|estado/i.test(error.message)) {
      throw new ApiError(409, error.message);
    }
    throw new ApiError(400, error.message);
  }

  return ok(await loadCountDetail(supabase, params.id));
});
