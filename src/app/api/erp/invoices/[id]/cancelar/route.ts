import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { getPacProvider } from '@/lib/pac';
import { loadInvoiceDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

const CancelBody = z.object({
  motivo: z.string().trim().min(1, 'El motivo es obligatorio'),
});

// POST /api/erp/invoices/[id]/cancelar — cancela ante el PAC (si está timbrada)
// y marca la factura como cancelada (soft; facturacion/cancelar).
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'cancelar');
  const supabase = erpClientFor(session);

  const b = CancelBody.parse(await req.json());

  const inv = await loadInvoiceDetail(supabase, params.id);
  if (inv.status === 'cancelada') {
    throw new ApiError(409, 'La factura ya está cancelada');
  }

  if (inv.uuid) {
    await getPacProvider().cancelar(inv.uuid, b.motivo);
  }

  const { error } = await supabase
    .from('invoices')
    .update({ status: 'cancelada', cancelada_at: new Date().toISOString() })
    .eq('id', inv.id);
  if (error) throw new ApiError(400, error.message);

  return ok(await loadInvoiceDetail(supabase, inv.id));
});
