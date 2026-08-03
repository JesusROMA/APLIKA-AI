import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadReceivableDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

const PagoBody = z.object({
  monto: z.number().positive(),
  formaPago: z.string().trim().min(1),
});

// POST /api/erp/receivables/[id]/pago — registra un cobro (facturacion/editar).
// La RPC registrar_pago_factura inserta el pago, recalcula saldo y fija el
// estado (pagada / pago_parcial). 42501→403, estado inválido→409.
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'editar');
  const supabase = erpClientFor(session);

  const b = PagoBody.parse(await req.json());

  const inv = await loadReceivableDetail(supabase, params.id);
  if (inv.status !== 'timbrada' && inv.status !== 'pago_parcial') {
    throw new ApiError(409, `La factura no admite pagos (estado: ${inv.status})`);
  }

  const { error } = await supabase.rpc('registrar_pago_factura', {
    p_invoice: inv.id,
    p_monto: b.monto,
    p_forma: b.formaPago,
  });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: facturacion/editar');
    if (error.code === 'P0001') throw new ApiError(409, error.message);
    throw new ApiError(400, error.message);
  }

  return ok(await loadReceivableDetail(supabase, inv.id));
});
