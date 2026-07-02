import { handle, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/organization/modules — módulos activos del tenant logueado
 * (vía JWT → organization_id, resuelto por RLS). El Panel Cliente construye
 * su navegación con esto. super_admin (sin org) recibe el catálogo completo.
 * Respuesta: { vertical, modules: [{ key, name, icon, route, core }] }
 */
export const GET = handle(async () => {
  const ctx = await requireUser();
  const supabase = createSupabaseServerClient();

  // super_admin no pertenece a un tenant: ve todos los módulos (modo soporte)
  if (ctx.role === 'super_admin' || !ctx.organizationId) {
    const { data, error } = await supabase
      .from('modules')
      .select('key, name, icon, route_prefix, core, sort')
      .order('sort');
    if (error) throw error;
    return ok({
      vertical: null,
      modules: (data ?? []).map((m: any) => ({ key: m.key, name: m.name, icon: m.icon, route: m.route_prefix, core: m.core })),
    });
  }

  const [{ data: org }, { data: mods, error }] = await Promise.all([
    supabase.from('organizations').select('vertical_id, verticals ( key )').eq('id', ctx.organizationId).maybeSingle(),
    supabase
      .from('organization_modules')
      .select('enabled, modules ( key, name, icon, route_prefix, core, sort )')
      .eq('organization_id', ctx.organizationId),
  ]);
  if (error) throw error;

  const modules = (mods ?? [])
    .filter((r: any) => r.enabled && r.modules)
    .map((r: any) => ({
      key: r.modules.key,
      name: r.modules.name,
      icon: r.modules.icon,
      route: r.modules.route_prefix,
      core: r.modules.core,
      sort: r.modules.sort,
    }))
    .sort((a: any, b: any) => a.sort - b.sort)
    .map(({ sort, ...m }: any) => m);

  return ok({ vertical: (org as any)?.verticals?.key ?? null, modules });
});
