import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Cliente Supabase para Server Components / Route Handlers.
 * Usa la sesión del usuario (cookies) y la anon key => RLS ACTIVA.
 * Nunca usar la service role aquí.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
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
