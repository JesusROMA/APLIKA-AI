import { z } from 'zod';
import { ApiError, handle, ok } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

/**
 * POST /api/auth/login  { email, password }
 * Valida con Supabase Auth (fija cookies de sesión) y devuelve la ruta del
 * panel destino según el rol.
 */
export const POST = handle(async (req) => {
  const { email, password } = Body.parse(await req.json());
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new ApiError(401, 'Correo o contraseña incorrectos');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const redirect =
    profile?.role === 'super_admin'
      ? '/dc/Panel Super-admin.dc.html'
      : '/dc/Panel Cliente.dc.html';

  return ok({ ok: true, role: profile?.role ?? 'tenant_user', redirect });
});
