import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Cliente Supabase con SERVICE ROLE — BYPASSEA RLS.
 * Úsalo SOLO en el servidor y SOLO para operaciones de confianza:
 *  - Webhooks de Stripe (no hay sesión de usuario)
 *  - Captura de leads desde la landing pública
 *  - Tareas de super-admin / impersonación controlada
 * Toda consulta debe filtrar explícitamente por organization_id cuando aplique.
 *
 * NOTA (F-1b): al generar los tipos de la BD (supabase gen types →
 * database.types.ts), cambiar a SupabaseClient<Database> aquí y en los
 * factories de server/client para tipado estricto de tablas.
 * (Antes era ReturnType<typeof createClient>, que colapsa los genéricos a
 * `never` y rompía el typecheck en todos los .insert/.update con este cliente.)
 */
let _admin: SupabaseClient | null = null;

export function createSupabaseAdminClient() {
  if (_admin) return _admin;
  _admin = createClient(env.supabaseUrl(), env.supabaseServiceRole(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
