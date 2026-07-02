import { z } from 'zod';
import { ApiError, handle, ok } from '@/lib/api';
import { isDemo } from '@/lib/demo';

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
    const isAdmin = email.toLowerCase() === 'admin@aplika.ai';
    // En demo aceptamos cualquier contraseña no vacía (Zod ya valida min 1)
    // para facilitar la exploración del frontend.
    return ok({
      ok: true,
      demo: true,
      role: isAdmin ? 'super_admin' : 'tenant_admin',
      redirect: isAdmin ? adminRedirect : clientRedirect,
    });
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
