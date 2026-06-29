// Acceso centralizado y validado a variables de entorno (Regla #0: solo Aplika).
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta variable de entorno requerida: ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => req('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => req('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRole: () => req('APLIKA_SUPABASE_SERVICE_ROLE_KEY'),
  stripeSecret: () => req('APLIKA_STRIPE_SECRET_KEY'),
  stripeWebhookSecret: () => req('APLIKA_STRIPE_WEBHOOK_SECRET'),
  pacProvider: () => process.env.APLIKA_PAC_PROVIDER || 'stub',
  rootDomain: () => process.env.APLIKA_ROOT_DOMAIN || 'aplika.shop',
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  leadsNotifyEmail: () => process.env.APLIKA_LEADS_NOTIFY_EMAIL || 'hola@aplika.ai',
};
