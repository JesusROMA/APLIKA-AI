'use client';

/**
 * Alta de orden de compra (F5 · Tanda B, módulo `compras`). Selecciona proveedor
 * y almacén, fecha esperada, notas, y un editor de partidas (ProductPicker +
 * cantidad + costo unitario + IVA) con totales en vivo. Se crea en borrador; al
 * guardar navega al detalle. El server es la autoridad (RLS + guards + totales).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPurchaseOrder, listSuppliers } from '../../_lib/compras';
import { listWarehouses } from '../../_lib/api';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { SelectField, TextField, type SelectOption } from '../../_components/Field';
import { ReadOnlyBadge } from '../../_components/States';
import { POLinesEditor, type POEditorLine } from '../_components/POLinesEditor';
import { ComprasNav } from '../_components/ComprasNav';

export default function NuevaOrdenCompraPage() {
  const router = useRouter();
  const can = useCan();
  const canCreate = can('compras', 'crear');

  const suppliers = useAsyncData(() => listSuppliers({ pageSize: 100, status: 'activo' }));
  const warehouses = useAsyncData(() => listWarehouses({ pageSize: 100 }));

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notas, setNotas] = useState('');
  const [lines, setLines] = useState<POEditorLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supplierOpts: SelectOption[] = useMemo(
    () => (suppliers.data?.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [suppliers.data],
  );
  const warehouseOpts: SelectOption[] = useMemo(
    () =>
      (warehouses.data?.data ?? []).map((w) => ({
        value: w.id,
        label: w.isDefault ? `${w.name} (predeterminado)` : w.name,
      })),
    [warehouses.data],
  );

  const validationError = !supplierId
    ? 'Selecciona un proveedor.'
    : lines.length === 0
      ? 'Agrega al menos una partida.'
      : lines.some((l) => !(l.qty > 0))
        ? 'Cada partida requiere una cantidad mayor a 0.'
        : lines.some((l) => !l.productVariantId && !l.name.trim())
          ? 'Las partidas libres requieren un concepto.'
          : null;

  const canSubmit = canCreate && !validationError && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await createPurchaseOrder({
        supplierId,
        warehouseId: warehouseId || null,
        expectedDate: expectedDate || null,
        notas: notas.trim() || null,
        lines: lines.map((l) => ({
          productVariantId: l.productVariantId,
          sku: l.sku,
          name: l.name.trim() || undefined,
          qty: l.qty,
          unitCost: l.unitCost,
          ivaRate: l.ivaRate,
        })),
      });
      router.push(`/panel/compras/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la orden de compra.');
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Nueva orden de compra</h2>
          <p className="panel-page-sub">Crea una OC en borrador para un proveedor.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/compras">
          Volver
        </Link>
      </div>

      <ComprasNav />

      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <fieldset disabled={!canCreate} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="panel-form-grid">
          <SelectField
            label="Proveedor"
            name="supplierId"
            value={supplierId}
            onChange={setSupplierId}
            options={supplierOpts}
            placeholder="Selecciona proveedor…"
            required
          />
          <SelectField
            label="Almacén de destino"
            name="warehouseId"
            value={warehouseId}
            onChange={setWarehouseId}
            options={warehouseOpts}
            placeholder="Sin especificar…"
            hint="Almacén al que entrará la mercancía al recibir."
          />
          <TextField
            label="Fecha esperada"
            name="expectedDate"
            type="date"
            value={expectedDate}
            onChange={setExpectedDate}
          />
        </div>

        <div style={{ marginTop: 'var(--sp-2)' }}>
          <POLinesEditor value={lines} onChange={setLines} disabled={!canCreate} />
        </div>

        <div className="panel-field" style={{ marginTop: 'var(--sp-2)' }}>
          <label className="panel-field-label" htmlFor="po-notas">
            Notas
          </label>
          <textarea
            id="po-notas"
            className="panel-textarea"
            value={notas}
            rows={3}
            placeholder="Condiciones, referencias del proveedor…"
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
          onClick={() => router.push('/panel/compras')}
          disabled={saving}
        >
          Cancelar
        </button>
        <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
          {saving ? 'Guardando…' : 'Crear orden'}
        </button>
      </div>
    </div>
  );
}
