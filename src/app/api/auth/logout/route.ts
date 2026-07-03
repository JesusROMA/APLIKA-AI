import { handle, ok } from '@/lib/api';
import { isDemo, DEMO_COOKIE } from '@/lib/demo';

export const dynamic = 'force-dynamic';

// POST /api/auth/logout — cierra la sesión.
export const POST = handle(async () => {
  // Modo demo: solo limpia la cookie de identidad (no hay sesión Supabase).
  if (isDemo()) {
    const res = ok({ ok: true, redirect: '/dc/Login.dc.html' });
    res.cookies.delete(DEMO_COOKIE);
    return res;
  }

  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  return ok({ ok: true, redirect: '/dc/Login.dc.html' });
});
