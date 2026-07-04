import { cookies } from 'next/headers';
import { handle, ok } from '@/lib/api';
import { isDemo, demoIdentity, DEMO_COOKIE } from '@/lib/demo';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me — usuario de la sesión actual (para el menú de perfil).
 * Modo demo (sin Supabase): identidad según el correo con que se inició sesión
 * (cookie DEMO_COOKIE). Modo real: perfil desde Supabase.
 */
export const GET = handle(async () => {
  if (isDemo()) {
    const email = cookies().get(DEMO_COOKIE)?.value;
    const id = demoIdentity(email);
    return ok({ authenticated: true, demo: true, name: id.name, email: id.email, role: id.role, org: id.org, slug: id.slug, vertical: id.vertical });
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

  // Organización del usuario (nombre, plan, slug y vertical) para el panel
  let org: { name: string; plan: string | null } | null = null;
  let slug: string | null = null;
  let vertical: string | null = null;
  if ((profile as any)?.organization_id) {
    const { data: o } = await supabase
      .from('organizations')
      .select('name, slug, plans ( name ), verticals ( key )')
      .eq('id', (profile as any).organization_id)
      .maybeSingle();
    if (o) {
      org = { name: (o as any).name, plan: (o as any).plans?.name ?? null };
      slug = (o as any).slug ?? null;
      vertical = (o as any).verticals?.key ?? null;
    }
  }

  return ok({
    authenticated: true,
    name: (profile as any)?.full_name ?? user.email,
    email: (profile as any)?.email ?? user.email,
    role: (profile as any)?.role ?? 'tenant_user',
    org,
    slug,
    vertical,
  });
});
