'use client';

/**
 * Alta de conteo físico (F2 · Tanda B, módulo `inventario`). Se elige almacén y
 * notas; al crear, el server siembra una partida por CADA variante con existencia
 * en ese almacén (snapshot de system_qty). Luego se navega al detalle a capturar.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCount } from '../../../_lib/conteos';
import { listWarehouses } from '../../../_lib/api';
import { useAsyncData } from '../../../_lib/hooks';
import { useCan } from '../../../_components/session';
import { SelectField, type SelectOption } from '../../../_components/Field';
import { ReadOnlyBadge } from '../../../_components/States';

export default function NuevoConteoPage() {
  const router = useRouter();
  const can = useCan();
  const canCreate = can('inventario', 'crear');
  const warehouses = useAsyncData(() => listWarehouses({ pageSize: 100 }));

  const [warehouseId, setWarehouseId] = useState<string>('');
  const [notas, setNotas] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warehouseOpts: SelectOption[] = useMemo(
    () =>
      (warehouses.data?.data ?? []).map((w) => ({
        value: w.id,
        label: w.isDefault ? `${w.name} (predeterminado)` : w.name,
      })),
    [warehouses.data],
  );

  const validationError = !warehouseId ? 'Selecciona un almacén.' : null;
  const canSubmit = canCreate && !validationError && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await createCount({
        warehouseId,
        notas: notas.trim() || undefined,
      });
      router.push(`/panel/inventario/conteos/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el conteo.');
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Nuevo conteo</h2>
          <p className="panel-page-sub">
            Crea un conteo en borrador; se sembrarán las partidas con las existencias del almacén.
          </p>
        </div>
      </div>

      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <fieldset disabled={!canCreate} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="panel-form-grid">
          <SelectField
            label="Almacén"
            name="warehouseId"
            value={warehouseId}
            onChange={setWarehouseId}
            options={warehouseOpts}
            required
            placeholder="Selecciona un almacén"
          />
        </div>

        <div className="panel-field">
          <label className="panel-field-label" htmlFor="count-notas">
            Notas
          </label>
          <textarea
            id="count-notas"
            className="panel-textarea"
            value={notas}
            rows={3}
            placeholder="Motivo del conteo, responsable…"
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>
      </fieldset>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 'var(--sp-2)',
          marginTop: 'var(--sp-3)',
        }}
      >
        {!canCreate && <ReadOnlyBadge />}
        {validationError && canCreate && <span className="panel-field-hint">{validationError}</span>}
        <button
          type="button"
          className="pbtn pbtn--ghost"
          onClick={() => router.push('/panel/inventario/conteos')}
          disabled={saving}
        >
          Cancelar
        </button>
        <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
          {saving ? 'Creando…' : 'Crear conteo'}
        </button>
      </div>
    </div>
  );
}
