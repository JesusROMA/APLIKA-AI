import { z } from 'zod';
import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { convertQuoteToOrder } from '@/lib/erp/conversions';

export const dynamic = 'force-dynamic';

const Body = z.object({ quoteId: z.string().uuid() });

// POST /api/erp/conversions/quote-to-order — cotización aceptada → pedido.
// Requiere leer cotizaciones y crear pedidos (RLS lo refuerza).
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'cotizaciones', 'ver');
  requireAccess(session, 'ordenes', 'crear');
  const supabase = erpClientFor(session);

  const { quoteId } = Body.parse(await req.json());
  const orderId = await convertQuoteToOrder(supabase, session, quoteId);
  return ok({ ok: true, orderId }, { status: 201 });
});
