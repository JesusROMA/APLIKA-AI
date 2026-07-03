import { z } from 'zod';
import { ApiError, handle, ok } from '@/lib/api';
import { isDemo, demoIdentity, DEMO_COOKIE } from '@/lib/demo';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

const clientRedirect = '/dc/Panel Cliente.dc.html';
const adminRedirect = '/dc/Panel Super-admin.dc.html';

/**
 * POST /api/auth/login  { email, password }
 * - Modo demo (sin Supabase): valida credenciales demo y redirige por rol.
 * - Modo real: autentica con Supabase Auth (fija cookies de sesión).
 */
export const POST = handle(async (req) => {
  const { email, password } = Body.parse(await req.json());

  // --- Modo demo: pruebas locales sin Supabase ---
  if (isDemo()) {
    // En demo aceptamos cualquier contraseña no vacía (Zod ya valida min 1)
    // para facilitar la exploración del frontend.
    const id = demoIdentity(email);
    const isAdmin = id.role === 'super_admin';
    const res = ok({
      ok: true,
      demo: true,
      role: id.role,
      redirect: isAdmin ? adminRedirect : clientRedirect,
    });
    // Recuerda quién inició sesión para que /api/auth/me devuelva su identidad.
    res.cookies.set(DEMO_COOKIE, email.trim().toLowerCase(), {
      path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  }

  // --- Modo real: Supabase ---
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new ApiError(401, 'Correo o contraseña incorrectos');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  return ok({
    ok: true,
    role: profile?.role ?? 'tenant_user',
    redirect: profile?.role === 'super_admin' ? adminRedirect : clientRedirect,
  });
});
