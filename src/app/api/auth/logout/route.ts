import { handle, ok } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/auth/logout — cierra la sesión.
export const POST = handle(async () => {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  return ok({ ok: true, redirect: '/dc/Login.dc.html' });
});
