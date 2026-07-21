import { z } from 'zod';
import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { convertSalesNotesToGlobalInvoice } from '@/lib/erp/conversions';

export const dynamic = 'force-dynamic';

const Body = z.object({
  salesNoteIds: z.array(z.string().uuid()).min(2),
  metodoPago: z.enum(['PUE', 'PPD']).optional(),
  formaPago: z.string().optional(),
  serie: z.string().optional(),
});

// POST /api/erp/conversions/global-invoice — N remisiones cobradas (mismo
// cliente) → 1 factura global. Candado: una remisión no puede ir en 2 facturas.
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'remisiones', 'editar');
  requireAccess(session, 'facturacion', 'crear');
  const supabase = erpClientFor(session);

  const b = Body.parse(await req.json());
  const invoiceId = await convertSalesNotesToGlobalInvoice(supabase, session, b.salesNoteIds, {
    metodoPago: b.metodoPago,
    formaPago: b.formaPago,
    serie: b.serie,
  });
  return ok({ ok: true, invoiceId }, { status: 201 });
});
