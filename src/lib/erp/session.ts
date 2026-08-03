import { requireUser } from '@/lib/auth';
import { readImpersonationCookie } from '@/lib/erp/impersonation';
import { getErpClient } from '@/lib/erp/db';
import { buildPermissionMap } from '@/lib/erp/guards';
import type { ModuleKey, Role, SessionInfo } from '@/lib/types/erp';

/**
 * Resuelve la sesión ERP completa (C2): identidad + org efectiva (con
 * impersonación resuelta) + módulos activos + PermissionMap. Base de
 * `GET /api/erp/me` y de todos los guards de los endpoints ERP.
 *
 * - 401 si no hay usuario (vía requireUser).
 * - super_admin sin impersonar ⇒ organization/impersonating = null, perms all
 *   true; los guards de datos exigen tenant y devolverán 403.
 */
export async function getErpSession(): Promise<SessionInfo> {
  const ctx = await requireUser();

  const impersonatedOrgId = ctx.role === 'super_admin' ? readImpersonationCookie() : null;
  const effectiveOrgId = impersonatedOrgId ?? ctx.organizationId;
  const supabase = getErpClient(impersonatedOrgId);

  const role = ctx.role as Role;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', ctx.userId)
    .maybeSingle();
  const fullName = profile?.full_name ?? null;

  let organization: SessionInfo['organization'] = null;
  let impersonating: SessionInfo['impersonating'] = null;
  let modules: SessionInfo['modules'] = [];

  if (effectiveOrgId) {
    const [{ data: org }, { data: mods }] = await Promise.all([
      supabase
        .from('organizations')
        .select('id, slug, name, logo_url, brand_color, verticals ( key )')
        .eq('id', effectiveOrgId)
        .maybeSingle(),
      supabase
        .from('organization_modules')
        .select('enabled, modules ( key, name, icon, route_prefix, sort )')
        .eq('organization_id', effectiveOrgId),
    ]);

    if (org) {
      const vertical = org.verticals?.key ?? null;
      organization = {
        id: org.id,
        slug: org.slug,
        name: org.name,
        vertical,
        logoUrl: org.logo_url ?? null,
        brandColor: org.brand_color ?? null,
      };
      if (impersonatedOrgId) {
        impersonating = { id: org.id, slug: org.slug, name: org.name };
      }
    }

    modules = (mods ?? [])
      .filter((r) => r.enabled && r.modules)
      .map((r) => r.modules!)
      .sort((a, b) => a.sort - b.sort)
      .map((m) => ({
        key: m.key as ModuleKey,
        label: m.name,
        icon: m.icon ?? '',
        routePrefix: m.route_prefix,
      }));
  }

  const perms = await buildPermissionMap(supabase, { role });

  return {
    userId: ctx.userId,
    email: ctx.email ?? '',
    fullName,
    role,
    organization,
    impersonating,
    modules,
    perms,
  };
}
