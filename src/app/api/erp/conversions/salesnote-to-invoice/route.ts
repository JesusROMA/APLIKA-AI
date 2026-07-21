import { z } from 'zod';
import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { convertSalesNoteToInvoice } from '@/lib/erp/conversions';

export const dynamic = 'force-dynamic';

const Body = z.object({
  salesNoteId: z.string().uuid(),
  metodoPago: z.enum(['PUE', 'PPD']).optional(),
  formaPago: z.string().optional(),
  serie: z.string().optional(),
});

// POST /api/erp/conversions/salesnote-to-invoice — remisión cobrada → factura.
// Marca la remisión 'facturada' (requiere remisiones/editar) y crea la factura.
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'remisiones', 'editar');
  requireAccess(session, 'facturacion', 'crear');
  const supabase = erpClientFor(session);

  const b = Body.parse(await req.json());
  const invoiceId = await convertSalesNoteToInvoice(supabase, session, b.salesNoteId, {
    metodoPago: b.metodoPago,
    formaPago: b.formaPago,
    serie: b.serie,
  });
  return ok({ ok: true, invoiceId }, { status: 201 });
});
