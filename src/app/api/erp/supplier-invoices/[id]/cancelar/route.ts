import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { loadSupplierInvoiceDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/supplier-invoices/[id]/cancelar — cancela una factura de
// proveedor (compras/cancelar). Solo si NO tiene pagos (si los tiene, 409). Al
// cancelar una 'registrada', BAJA la CxP: suppliers.balance -= total.
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'cancelar');
  const supabase = erpClientFor(session);

  const inv = await loadSupplierInvoiceDetail(supabase, params.id);
  if (inv.status === 'cancelada') {
    throw new ApiError(409, 'La factura ya está cancelada');
  }
  if (inv.payments.length > 0) {
    throw new ApiError(409, 'No se puede cancelar una factura con pagos registrados');
  }

  const { error } = await supabase
    .from('supplier_invoices')
    .update({ status: 'cancelada' })
    .eq('id', inv.id);
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: compras/cancelar');
    throw new ApiError(400, error.message);
  }

  // Baja la CxP solo si la factura consumía saldo (estaba 'registrada').
  if (inv.status === 'registrada') {
    const { data: sup } = await supabase
      .from('suppliers')
      .select('balance')
      .eq('id', inv.supplierId)
      .maybeSingle();
    const { error: balErr } = await supabase
      .from('suppliers')
      .update({ balance: Number(sup?.balance ?? 0) - inv.total })
      .eq('id', inv.supplierId);
    if (balErr) throw new ApiError(400, balErr.message);
  }

  return ok(await loadSupplierInvoiceDetail(supabase, inv.id));
});
