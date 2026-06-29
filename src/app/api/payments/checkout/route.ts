import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const Body = z.object({ orderId: z.string().uuid() });

// POST /api/payments/checkout — crea una sesión de Stripe Checkout para un pedido.
// El estado de pago lo decide DESPUÉS el webhook firmado, nunca el cliente.
export const POST = handle(async (req) => {
  const ctx = await requireTenant();
  const { orderId } = Body.parse(await req.json());
  const supabase = createSupabaseServerClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, folio, total, status')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new ApiError(404, 'Pedido no encontrado');
  if ((order as any).status === 'cancelada') throw new ApiError(400, 'Pedido cancelado');

  const total = Number((order as any).total);
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    currency: 'mxn',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'mxn',
          unit_amount: Math.round(total * 100), // centavos — el monto lo fija el servidor
          product_data: { name: `Pedido ${(order as any).folio}` },
        },
      },
    ],
    // metadata clave para que el webhook ate el pago al pedido y al tenant
    metadata: { order_id: orderId, organization_id: ctx.organizationId, folio: (order as any).folio },
    success_url: `${env.appUrl()}/dc/Panel Cliente.dc.html?paid=${(order as any).folio}`,
    cancel_url: `${env.appUrl()}/dc/Panel Cliente.dc.html`,
  });

  // Registra el intento en estado pendiente (idempotente por order)
  await supabase.from('payments').upsert(
    {
      organization_id: ctx.organizationId,
      order_id: orderId,
      amount: total,
      currency: 'mxn',
      status: 'pendiente',
      method: 'Stripe Checkout',
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    },
    { onConflict: 'stripe_payment_intent_id' },
  );

  return ok({ url: session.url, sessionId: session.id });
});
