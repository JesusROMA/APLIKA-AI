import { handle, ok } from '@/lib/api';
import { isDemo } from '@/lib/demo';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me — usuario de la sesión actual (para el menú de perfil).
 * Modo demo (sin Supabase): devuelve un usuario genérico; el frontend usa
 * su propio default por panel. Modo real: perfil desde Supabase.
 */
export const GET = handle(async () => {
  if (isDemo()) {
    return ok({ authenticated: true, demo: true, name: 'Usuario demo', email: 'demo@aplika.ai', role: 'tenant_admin' });
  }

  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ok({ authenticated: false });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email, organization_id')
    .eq('id', user.id)
    .single();

  // Organización del usuario (nombre y plan) para el pie del sidebar
  let org: { name: string; plan: string | null } | null = null;
  if ((profile as any)?.organization_id) {
    const { data: o } = await supabase
      .from('organizations')
      .select('name, plans ( name )')
      .eq('id', (profile as any).organization_id)
      .maybeSingle();
    if (o) org = { name: (o as any).name, plan: (o as any).plans?.name ?? null };
  }

  return ok({
    authenticated: true,
    name: (profile as any)?.full_name ?? user.email,
    email: (profile as any)?.email ?? user.email,
    role: (profile as any)?.role ?? 'tenant_user',
    org,
  });
});
