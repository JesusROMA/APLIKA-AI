import { z } from 'zod';
import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { convertOrderToInvoice } from '@/lib/erp/conversions';

export const dynamic = 'force-dynamic';

const Body = z.object({
  orderId: z.string().uuid(),
  metodoPago: z.enum(['PUE', 'PPD']).optional(),
  formaPago: z.string().optional(),
  serie: z.string().optional(),
});

// POST /api/erp/conversions/order-to-invoice — pedido → factura (borrador).
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'ordenes', 'ver');
  requireAccess(session, 'facturacion', 'crear');
  const supabase = erpClientFor(session);

  const b = Body.parse(await req.json());
  const invoiceId = await convertOrderToInvoice(supabase, session, b.orderId, {
    metodoPago: b.metodoPago,
    formaPago: b.formaPago,
    serie: b.serie,
  });
  return ok({ ok: true, invoiceId }, { status: 201 });
});
