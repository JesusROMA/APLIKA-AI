import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// El webhook necesita el body crudo para validar la firma.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/stripe — webhook FIRMADO.
 * El estado de pago lo decide aquí (servidor de confianza), nunca el cliente.
 * Marca payment + order como pagados y dispara el decremento de inventario.
 */
export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Sin firma' }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, env.stripeWebhookSecret());
  } catch (err: any) {
    console.error('[stripe] firma inválida:', err?.message);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        await markPaid(admin, {
          orderId: s.metadata?.order_id,
          organizationId: s.metadata?.organization_id,
          amount: (s.amount_total ?? 0) / 100,
          paymentIntentId: typeof s.payment_intent === 'string' ? s.payment_intent : null,
          method: 'Tarjeta (Stripe Checkout)',
        });
        break;
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await markPaid(admin, {
          orderId: pi.metadata?.order_id,
          organizationId: pi.metadata?.organization_id,
          amount: (pi.amount_received ?? pi.amount) / 100,
          paymentIntentId: pi.id,
          chargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
          method: 'Tarjeta',
        });
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await admin
          .from('payments')
          .update({ status: 'fallido' })
          .eq('stripe_payment_intent_id', pi.id);
        break;
      }
      case 'charge.refunded': {
        const ch = event.data.object as Stripe.Charge;
        await admin
          .from('payments')
          .update({ status: 'reembolsado' })
          .eq('stripe_payment_intent_id', typeof ch.payment_intent === 'string' ? ch.payment_intent : '');
        break;
      }
      default:
        // Eventos no manejados: 200 para no provocar reintentos.
        break;
    }
  } catch (err) {
    console.error('[stripe] error procesando evento', event.type, err);
    return NextResponse.json({ error: 'Error procesando evento' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function markPaid(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  p: { orderId?: string; organizationId?: string; amount: number; paymentIntentId?: string | null; chargeId?: string | null; method: string },
) {
  if (!p.orderId || !p.organizationId) return;

  // Upsert del pago como exitoso (idempotente por payment_intent o por order)
  await admin.from('payments').upsert(
    {
      organization_id: p.organizationId,
      order_id: p.orderId,
      amount: p.amount,
      currency: 'mxn',
      status: 'exitoso',
      method: p.method,
      stripe_payment_intent_id: p.paymentIntentId ?? null,
      stripe_charge_id: p.chargeId ?? null,
    },
    { onConflict: 'stripe_payment_intent_id' },
  );

  // Transición a 'pagado' (decrementa inventario atómicamente). Idempotente.
  const { data: order } = await admin.from('orders').select('status').eq('id', p.orderId).maybeSingle();
  const status = (order as any)?.status;
  if (status && ['borrador', 'confirmado'].includes(status)) {
    const { error } = await admin.rpc('transition_order', { p_order_id: p.orderId, p_new: 'pagado' });
    if (error) console.error('[stripe] transition_order falló:', error.message);
  }
}
