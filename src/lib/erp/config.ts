import type { ErpClient } from '@/lib/erp/db';
import { ALL_ACTIONS, ALL_MODULE_KEYS } from '@/lib/erp/constants';
import type { ModuleKey, PermAction, Role } from '@/lib/types/erp';
import type { ModuleToggleRow, PermissionCell } from '@/lib/types/erp-config';

/**
 * Helpers de lectura para el panel de Configuración (F4). PROPIEDAD DEL
 * ORQUESTADOR. Los consume AGENTE-CONFIG; la escritura la hacen sus endpoints
 * (RLS `config/configurar` en role_permissions/org_series; RPC `set_org_module`).
 */

const TENANT_ROLES: Role[] = ['tenant_admin', 'tenant_user', 'tenant_viewer'];

/**
 * Matriz de permisos del tenant: default global (org NULL) + override del tenant
 * + efectivo. Lee `role_permissions` visible bajo RLS (defaults + overrides).
 */
export async function fetchPermissionMatrix(
  supabase: ErpClient,
  orgId: string,
): Promise<PermissionCell[]> {
  const { data, error } = await supabase
    .from('role_permissions')
    .select('organization_id, role, module_key, action, allowed');
  if (error) throw error;

  const key = (r: string, m: string, a: string) => `${r}|${m}|${a}`;
  const defaults = new Map<string, boolean>();
  const overrides = new Map<string, boolean>();
  for (const row of data ?? []) {
    const k = key(row.role, row.module_key, row.action);
    if (row.organization_id === null) defaults.set(k, row.allowed);
    else if (row.organization_id === orgId) overrides.set(k, row.allowed);
  }

  const cells: PermissionCell[] = [];
  for (const role of TENANT_ROLES) {
    for (const moduleKey of ALL_MODULE_KEYS) {
      for (const action of ALL_ACTIONS) {
        const k = key(role, moduleKey, action);
        const def = defaults.get(k) ?? false;
        const ov = overrides.has(k) ? overrides.get(k)! : null;
        cells.push({
          role,
          moduleKey: moduleKey as ModuleKey,
          action: action as PermAction,
          defaultAllowed: def,
          override: ov,
          effective: ov ?? def,
        });
      }
    }
  }
  return cells;
}

/** Catálogo de módulos con su estado de activación en el tenant. */
export async function fetchModulesWithState(
  supabase: ErpClient,
  orgId: string,
): Promise<ModuleToggleRow[]> {
  const [{ data: mods, error: mErr }, { data: orgMods, error: oErr }] = await Promise.all([
    supabase.from('modules').select('key, name, core, sort').order('sort'),
    supabase.from('organization_modules').select('enabled, modules ( key )').eq('organization_id', orgId),
  ]);
  if (mErr) throw mErr;
  if (oErr) throw oErr;

  const enabledByKey = new Map<string, boolean>();
  for (const om of orgMods ?? []) {
    const k = (om.modules as { key: string } | null)?.key;
    if (k) enabledByKey.set(k, om.enabled);
  }
  return (mods ?? []).map((m) => ({
    key: m.key,
    name: m.name,
    core: m.core,
    enabled: m.core || (enabledByKey.get(m.key) ?? false),
  }));
}
