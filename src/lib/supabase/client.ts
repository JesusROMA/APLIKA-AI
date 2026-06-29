'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/** Cliente Supabase para el navegador (RLS activa con la sesión del usuario). */
export function createSupabaseBrowserClient() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnonKey());
}
