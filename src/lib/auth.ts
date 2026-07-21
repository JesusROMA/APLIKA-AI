import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api';
import { readImpersonationCookie } from '@/lib/erp/impersonation';

// F0: agrega 'tenant_viewer' (Solo-lectura) para calzar con el enum user_role
// de la BD. Sigue siendo un superconjunto seguro para el código existente.
export type UserRole = 'super_admin' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer' | 'customer';

export interface SessionContext {
  userId: string;
  email: string | null;
  role: UserRole;
  organizationId: string | null;
  /** Org impersonada (C1.3): presente solo si un super_admin tiene cookie activa. */
  impersonatedOrgId?: string | null;
}

/** Devuelve el contexto de sesión o null si no hay usuario autenticado. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id, email')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return {
    userId: user.id,
    email: profile.email ?? user.email ?? null,
    role: profile.role as UserRole,
    organizationId: profile.organization_id,
  };
}

/** Exige sesión válida; lanza 401 si no la hay. */
export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new ApiError(401, 'No autenticado');
  return ctx;
}

/**
 * Exige un tenant. Lanza 403 si no aplica. Un super_admin YA NO es rechazado si
 * tiene una cookie de impersonación válida (C1.3): en ese caso opera el tenant
 * impersonado y `organizationId` = la org impersonada.
 */
export async function requireTenant(): Promise<SessionContext & { organizationId: string }> {
  const ctx = await requireUser();
  if (ctx.role === 'super_admin') {
    const impersonatedOrgId = readImpersonationCookie();
    if (impersonatedOrgId) {
      return { ...ctx, organizationId: impersonatedOrgId, impersonatedOrgId };
    }
    // Sin impersonación explícita, super_admin no opera un tenant.
    throw new ApiError(403, 'super_admin debe impersonar un tenant para esta acción');
  }
  if (!ctx.organizationId) throw new ApiError(403, 'Usuario sin organización');
  return ctx as SessionContext & { organizationId: string };
}

/** Exige rol super_admin. */
export async function requireSuperAdmin(): Promise<SessionContext> {
  const ctx = await requireUser();
  if (ctx.role !== 'super_admin') throw new ApiError(403, 'Requiere super_admin');
  return ctx;
}

/** Exige uno de los roles dados. */
export async function requireRole(...roles: UserRole[]): Promise<SessionContext> {
  const ctx = await requireUser();
  if (!roles.includes(ctx.role)) throw new ApiError(403, 'Permisos insuficientes');
  return ctx;
}
