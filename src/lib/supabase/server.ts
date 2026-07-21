import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/** Opciones del cliente servidor. */
export interface ServerClientOptions {
  /**
   * Org a impersonar (C1.3). Cuando se pasa, se agrega el header PostgREST
   * `x-aplika-impersonate`; la BD (app.current_org_id v2) SOLO lo respeta si la
   * sesión es super_admin, así que es inofensivo para tenants normales.
   */
  impersonateOrgId?: string;
}

/**
 * Cliente Supabase para Server Components / Route Handlers.
 * Usa la sesión del usuario (cookies) y la anon key => RLS ACTIVA.
 * Nunca usar la service role aquí.
 */
export function createSupabaseServerClient(options?: ServerClientOptions) {
  const cookieStore = cookies();
  const globalHeaders: Record<string, string> = options?.impersonateOrgId
    ? { 'x-aplika-impersonate': options.impersonateOrgId }
    : {};
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    global: { headers: globalHeaders },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component sin contexto de respuesta: lo
          // refresca el middleware. Se puede ignorar con seguridad.
        }
      },
    },
  });
}
