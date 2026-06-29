import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api';

export type UserRole = 'super_admin' | 'tenant_admin' | 'tenant_user' | 'customer';

export interface SessionContext {
  userId: string;
  email: string | null;
  role: UserRole;
  organizationId: string | null;
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

/** Exige un tenant (tenant_admin/tenant_user). Lanza 403 si no aplica. */
export async function requireTenant(): Promise<SessionContext & { organizationId: string }> {
  const ctx = await requireUser();
  if (ctx.role === 'super_admin') {
    // super_admin debe operar un tenant vía impersonación explícita.
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
