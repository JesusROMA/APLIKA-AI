import Stripe from 'stripe';
import { env } from '@/lib/env';

let _stripe: Stripe | null = null;

/** Cliente Stripe (modelo estándar: una sola cuenta de Aplika).
 *  Arquitectura lista para Connect: cuando APLIKA_STRIPE_CONNECT_ENABLED=true se
 *  pasaría { stripeAccount } por tenant en las llamadas. */
export function stripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = new Stripe(env.stripeSecret(), { apiVersion: '2024-06-20' });
  return _stripe;
}

export const connectEnabled = () => process.env.APLIKA_STRIPE_CONNECT_ENABLED === 'true';
