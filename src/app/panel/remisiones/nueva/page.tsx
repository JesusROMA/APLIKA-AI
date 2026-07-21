'use client';

/**
 * Nueva remisión — mostrador rápido. Cliente opcional (Público en general),
 * editor de partidas y, al guardar, opción de cobrar de inmediato (efectivo /
 * tarjeta / transferencia) o dejarla abierta. UX ágil de punto de venta.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DocLineInput } from '@/lib/types/erp-ventas';
import { listWarehouses } from '../../_lib/api';
import { createSalesNote, cobrarSalesNote } from '../../_lib/remisiones';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { CustomerPicker } from '../../_components/CustomerPicker';
import { DocLinesEditor } from '../../_components/DocLinesEditor';
import { SelectField, type SelectOption } from '../../_components/Field';
import { ReadOnlyBadge } from '../../_components/States';
import { PAYMENT_METHODS, paymentLabel, type PaymentMethod } from '../_components/labels';

function lineIsValid(l: DocLineInput): boolean {
  const hasName = Boolean(l.productVariantId) || Boolean(l.name && l.name.trim());
  return hasName && Number(l.qty) > 0;
}

export default function NuevaRemisionPage() {
  const can = useCan();
  const router = useRouter();
  const canCreate = can('remisiones', 'crear');

  const warehouses = useAsyncData(() => listWarehouses({ pageSize: 100 }));
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [lines, setLines] = useState<DocLineInput[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warehouseOpts: SelectOption[] = useMemo(
    () => (warehouses.data?.data ?? []).map((w) => ({ value: w.id, label: w.name })),
    [warehouses.data],
  );

  // Preselecciona el almacén por defecto la primera vez que llega el catálogo.
  const defaultWh = useMemo(
    () => (warehouses.data?.data ?? []).find((w) => w.isDefault)?.id ?? '',
    [warehouses.data],
  );
  useEffect(() => {
    if (defaultWh) setWarehouseId((cur) => (cur === '' ? defaultWh : cur));
  }, [defaultWh]);

  const canSave = canCreate && lines.length > 0 && lines.every(lineIsValid) && !saving;

  async function save(cobrar: boolean) {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await createSalesNote({
        customerId,
        warehouseId: warehouseId || null,
        lines,
      });
      if (cobrar) await cobrarSalesNote(id, method);
      router.push(`/panel/remisiones/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la remisión.');
      setSaving(false);
    }
  }

  if (!canCreate) {
    return (
      <div>
        <div className="panel-page-head">
          <h2 className="panel-page-title">Nueva remisión</h2>
        </div>
        <div className="panel-card" style={{ padding: 'var(--sp-4)' }}>
          <ReadOnlyBadge />
          <p className="panel-page-sub" style={{ marginTop: 'var(--sp-2)' }}>
            No tienes permiso para crear remisiones.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Nueva remisión</h2>
          <p className="panel-page-sub">Venta de mostrador: agrega productos y cobra al instante.</p>
        </div>
      </div>

      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
        <div className="panel-form-grid">
          <CustomerPicker value={customerId} onChange={setCustomerId} allowPublico />
          <SelectField
            label="Almacén"
            name="warehouseId"
            value={warehouseId}
            onChange={setWarehouseId}
            options={warehouseOpts}
            placeholder="Almacén por defecto"
          />
        </div>
      </div>

      <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
        <DocLinesEditor customerId={customerId} lines={lines} onChange={setLines} />
      </div>

      <div className="panel-card" style={{ padding: 'var(--sp-4)' }}>
        <div className="panel-form-grid" style={{ alignItems: 'end' }}>
          <div className="panel-field">
            <label className="panel-field-label" htmlFor="pay-method">
              Forma de pago (al cobrar)
            </label>
            <select
              id="pay-method"
              className="panel-select"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {paymentLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end', flexWrap: 'wrap' }}
          >
            <button
              type="button"
              className="pbtn pbtn--ghost"
              disabled={!canSave}
              onClick={() => save(false)}
            >
              {saving ? 'Guardando…' : 'Guardar abierta'}
            </button>
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={!canSave}
              onClick={() => save(true)}
            >
              {saving ? 'Procesando…' : 'Guardar y cobrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
