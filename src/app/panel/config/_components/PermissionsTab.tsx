'use client';

/**
 * Editor de permisos RBAC del tenant: matriz módulo × acción × rol. Muestra el
 * valor efectivo (default global + override) con indicador de override vs
 * default. Los toggles hacen upsert del override (config/configurar). Solo
 * lectura si no hay permiso de escritura.
 */

import { useMemo, useState } from 'react';
import type { PermissionCell } from '@/lib/types/erp-config';
import type { PermAction, Role } from '@/lib/types/erp';
import { getPermissions, putPermission } from '../../_lib/config';
import { useAsyncData } from '../../_lib/hooks';
import { LoadingState, ErrorState, Badge, ReadOnlyBadge } from '../../_components/States';

const ROLES: { role: Role; label: string }[] = [
  { role: 'tenant_admin', label: 'Admin' },
  { role: 'tenant_user', label: 'Operador' },
  { role: 'tenant_viewer', label: 'Solo lectura' },
];

const ACTION_LABEL: Record<PermAction, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  cancelar: 'Cancelar',
  configurar: 'Configurar',
};

const MODULE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  ordenes: 'Pedidos',
  cotizaciones: 'Cotizaciones',
  inventario: 'Inventario',
  facturacion: 'Facturación',
  pagos: 'Pagos',
  crm: 'CRM',
  calendario: 'Agenda',
  expediente: 'Expediente',
  reservas_whatsapp: 'Reservas WhatsApp',
  ia_agente: 'Agente IA',
  config: 'Configuración',
  maestro_clientes: 'Maestro · Clientes',
  maestro_proveedores: 'Maestro · Proveedores',
  maestro_productos: 'Maestro · Productos',
  maestro_almacenes: 'Maestro · Almacenes',
  maestro_precios: 'Maestro · Listas de precios',
};

const cellKey = (role: string, moduleKey: string, action: string) =>
  `${role}|${moduleKey}|${action}`;

export function PermissionsTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useAsyncData(getPermissions);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Índice por (role,module,action) y agrupación por módulo → acciones.
  const { index, modules } = useMemo(() => {
    const idx = new Map<string, PermissionCell>();
    const byModule = new Map<string, Set<string>>();
    for (const c of data ?? []) {
      idx.set(cellKey(c.role, c.moduleKey, c.action), c);
      if (!byModule.has(c.moduleKey)) byModule.set(c.moduleKey, new Set());
      byModule.get(c.moduleKey)!.add(c.action);
    }
    return { index: idx, modules: [...byModule.entries()] };
  }, [data]);

  if (loading) return <LoadingState label="Cargando permisos…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const toggle = async (cell: PermissionCell) => {
    if (!canWrite || saving) return;
    const k = cellKey(cell.role, cell.moduleKey, cell.action);
    setSaving(k);
    setSaveError(null);
    try {
      await putPermission({
        role: cell.role,
        moduleKey: cell.moduleKey,
        action: cell.action,
        allowed: !cell.effective,
      });
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h3 className="panel-page-title" style={{ fontSize: 'var(--fs-lg, 1.1rem)' }}>
            Permisos por rol
          </h3>
          <p className="panel-page-sub">
            Marca la casilla para permitir la acción a cada rol. El asterisco indica un ajuste
            propio del tenant sobre el valor por omisión.
          </p>
        </div>
        {!canWrite && <ReadOnlyBadge />}
      </div>

      {saveError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {saveError}
        </p>
      )}

      {modules.map(([moduleKey, actionSet]) => {
        const actions = [...actionSet];
        return (
          <div key={moduleKey} className="panel-table-wrap" style={{ marginBottom: 'var(--sp-3)' }}>
            <table className="panel-table">
              <thead>
                <tr>
                  <th>{MODULE_LABEL[moduleKey] ?? moduleKey}</th>
                  {ROLES.map((r) => (
                    <th key={r.role} className="panel-table-num">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => (
                  <tr key={action}>
                    <td>{ACTION_LABEL[action as PermAction] ?? action}</td>
                    {ROLES.map((r) => {
                      const cell = index.get(cellKey(r.role, moduleKey, action));
                      if (!cell) return <td key={r.role} className="panel-table-num">—</td>;
                      const k = cellKey(r.role, moduleKey, action);
                      return (
                        <td key={r.role} className="panel-table-num">
                          <label
                            className="panel-checkbox"
                            style={{ justifyContent: 'flex-end', gap: 'var(--sp-1)' }}
                          >
                            {cell.override !== null && (
                              <Badge tone="blue">ajuste</Badge>
                            )}
                            <input
                              type="checkbox"
                              checked={cell.effective}
                              disabled={!canWrite || saving === k}
                              onChange={() => toggle(cell)}
                              aria-label={`${r.label} · ${ACTION_LABEL[action as PermAction] ?? action}`}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
