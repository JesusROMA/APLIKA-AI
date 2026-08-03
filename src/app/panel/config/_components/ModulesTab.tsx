'use client';

/**
 * Activación de módulos por tenant. Switch enabled por módulo (POST toggle vía
 * RPC set_org_module). Los módulos core no se pueden apagar (control deshabilitado).
 */

import { useState } from 'react';
import type { ModuleToggleRow } from '@/lib/types/erp-config';
import { getModules, toggleModule } from '../../_lib/config';
import { useAsyncData } from '../../_lib/hooks';
import { LoadingState, ErrorState, Badge, ReadOnlyBadge } from '../../_components/States';

export function ModulesTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useAsyncData(getModules);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (loading) return <LoadingState label="Cargando módulos…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const rows = data ?? [];

  const onToggle = async (m: ModuleToggleRow) => {
    if (!canWrite || m.core || saving) return;
    setSaving(m.key);
    setSaveError(null);
    try {
      await toggleModule(m.key, !m.enabled);
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
            Módulos activos
          </h3>
          <p className="panel-page-sub">Activa las áreas que tu equipo puede usar.</p>
        </div>
        {!canWrite && <ReadOnlyBadge />}
      </div>

      {saveError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {saveError}
        </p>
      )}

      <div className="panel-table-wrap">
        <table className="panel-table">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Estado</th>
              <th className="panel-table-num">Activo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.key}>
                <td>
                  <strong>{m.name}</strong>
                  {m.core && (
                    <>
                      {' '}
                      <Badge tone="blue">core</Badge>
                    </>
                  )}
                </td>
                <td>
                  {m.enabled ? <Badge tone="on">Activo</Badge> : <Badge tone="off">Inactivo</Badge>}
                </td>
                <td className="panel-table-num">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    disabled={!canWrite || m.core || saving === m.key}
                    onChange={() => onToggle(m)}
                    aria-label={`Activar ${m.name}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
