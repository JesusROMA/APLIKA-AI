import { ApiError } from '@/lib/api';
import type { ModuleKey, PermAction, PermissionMap, Role, SessionInfo } from '@/lib/types/erp';
import type { ErpClient } from '@/lib/erp/db';
import { ALL_ACTIONS, ALL_MODULE_KEYS, CORE_MODULES } from '@/lib/erp/constants';

/**
 * Construye el PermissionMap (C2) del rol en su contexto de org.
 * Lee `role_permissions` visibles bajo RLS (defaults globales org NULL +
 * overrides del tenant). Precedencia: fila específica del tenant > global.
 * super_admin ⇒ todo `true` (la BD ya lo refuerza en has_perm).
 */
export async function buildPermissionMap(
  supabase: ErpClient,
  session: Pick<SessionInfo, 'role'>,
): Promise<PermissionMap> {
  if (session.role === 'super_admin') {
    const map: PermissionMap = {};
    for (const m of ALL_MODULE_KEYS) {
      map[m] = {};
      for (const a of ALL_ACTIONS) map[m]![a] = true;
    }
    return map;
  }

  const { data, error } = await supabase
    .from('role_permissions')
    .select('module_key, action, allowed, organization_id')
    .eq('role', session.role);
  if (error) throw error;

  const rows = data ?? [];
  const map: PermissionMap = {};
  const set = (moduleKey: string, action: string, allowed: boolean) => {
    const m = moduleKey as ModuleKey;
    const a = action as PermAction;
    (map[m] ??= {})[a] = allowed;
  };
  // Globales primero, overrides del tenant después (ganan por precedencia).
  for (const r of rows) if (r.organization_id === null) set(r.module_key, r.action, r.allowed);
  for (const r of rows) if (r.organization_id !== null) set(r.module_key, r.action, r.allowed);
  return map;
}

/**
 * 403 limpio (antes de pegarle a la BD) si la org no tiene el módulo activo.
 * También 403 si no hay tenant en contexto (super_admin sin impersonar). Los
 * módulos core/virtuales (dashboard/config/maestros) están siempre activos.
 */
export function requireModule(session: SessionInfo, moduleKey: ModuleKey): void {
  if (!session.organization) {
    throw new ApiError(403, 'Se requiere un tenant; impersona uno para operar el ERP');
  }
  if (CORE_MODULES.has(moduleKey)) return;
  const active = session.modules.some((m) => m.key === moduleKey);
  if (!active) throw new ApiError(403, `Módulo no activo para este tenant: ${moduleKey}`);
}

/** 403 si el rol no tiene el permiso `action` en `moduleKey`. */
export function requirePerm(session: SessionInfo, moduleKey: ModuleKey, action: PermAction): void {
  if (session.role === 'super_admin') return; // super_admin (impersonando) ⇒ todo
  const allowed = session.perms[moduleKey]?.[action] === true;
  if (!allowed) throw new ApiError(403, `Sin permiso: ${moduleKey}/${action}`);
}

/** Azúcar: exige módulo + acción de una sola vez. */
export function requireAccess(
  session: SessionInfo,
  moduleKey: ModuleKey,
  action: PermAction,
): void {
  requireModule(session, moduleKey);
  requirePerm(session, moduleKey, action);
}

/** Re-export para conveniencia de los routes. */
export type { Role };
