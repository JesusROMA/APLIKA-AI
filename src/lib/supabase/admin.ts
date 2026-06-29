import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Cliente Supabase con SERVICE ROLE — BYPASSEA RLS.
 * Úsalo SOLO en el servidor y SOLO para operaciones de confianza:
 *  - Webhooks de Stripe (no hay sesión de usuario)
 *  - Captura de leads desde la landing pública
 *  - Tareas de super-admin / impersonación controlada
 * Toda consulta debe filtrar explícitamente por organization_id cuando aplique.
 */
let _admin: ReturnType<typeof createClient> | null = null;

export function createSupabaseAdminClient() {
  if (_admin) return _admin;
  _admin = createClient(env.supabaseUrl(), env.supabaseServiceRole(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
