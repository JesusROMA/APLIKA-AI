import crypto from 'crypto';
import { ApiError } from '@/lib/api';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Piezas compartidas de la gestión de usuarios del tenant (no es route).
 * Los perfiles se leen con service role ACOTADO a la organización (el RLS de
 * profiles solo deja listar al tenant_admin; el guard config/configurar ya
 * garantizó eso a nivel API).
 */

export const TENANT_ROLES = ['tenant_admin', 'tenant_user', 'tenant_viewer'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export interface OrgUserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  createdAt: string;
  lastSignInAt: string | null;
  suspended: boolean;
}

/** Contraseña temporal legible: Aplika-XXXX-XXXX (sin caracteres ambiguos). */
export function genTempPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const pick = () =>
    Array.from(crypto.randomBytes(4))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
  return `Aplika-${pick()}-${pick()}`;
}

/** Usuarios de la org: profiles + estado de acceso de Supabase Auth. */
export async function listOrgUsers(orgId: string): Promise<OrgUserRow[]> {
  const admin = createSupabaseAdminClient();
  const { data: profiles, error } = await admin
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .eq('organization_id', orgId)
    .order('created_at');
  if (error) throw new ApiError(400, error.message);

  // Estado de auth (última sesión, suspensión) en una sola llamada.
  const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const byId = new Map((authList?.users ?? []).map((u) => [u.id, u]));

  return (profiles ?? []).map((p) => {
    const au = byId.get(p.id) as
      | { last_sign_in_at?: string | null; banned_until?: string | null }
      | undefined;
    const bannedUntil = au?.banned_until ? new Date(au.banned_until).getTime() : 0;
    return {
      id: p.id,
      email: p.email ?? '',
      fullName: p.full_name,
      role: p.role,
      createdAt: p.created_at,
      lastSignInAt: au?.last_sign_in_at ?? null,
      suspended: bannedUntil > Date.now(),
    };
  });
}

/**
 * Carga el profile objetivo validando que pertenezca a la org y que no sea el
 * propio actor ni un super_admin (esos no se tocan desde el tenant).
 */
export async function loadTargetProfile(orgId: string, targetId: string, actorId: string) {
  if (targetId === actorId) throw new ApiError(400, 'No puedes modificar tu propio usuario');
  const admin = createSupabaseAdminClient();
  const { data: p, error } = await admin
    .from('profiles')
    .select('id, email, role, organization_id')
    .eq('id', targetId)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!p || p.organization_id !== orgId) throw new ApiError(404, 'Usuario no encontrado en tu organización');
  if (p.role === 'super_admin') throw new ApiError(403, 'Ese usuario no se administra desde aquí');
  return p;
}
