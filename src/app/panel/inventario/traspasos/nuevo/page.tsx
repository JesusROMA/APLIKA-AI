'use client';

/**
 * Alta de traspaso (F2 · Tanda B, módulo `inventario`). Selecciona almacén de
 * origen y destino (deben diferir), notas, y una lista de partidas (ProductPicker
 * + cantidad ENTERA). Se crea en borrador; el costo se captura al enviar. Al
 * guardar navega al detalle. El server es la autoridad (RLS + guards).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { VariantPick } from '@/lib/types/erp-ventas';
import { createTransfer } from '../../../_lib/traspasos';
import { listWarehouses } from '../../../_lib/api';
import { useAsyncData } from '../../../_lib/hooks';
import { useCan } from '../../../_components/session';
import { ProductPicker } from '../../../_components/ProductPicker';
import { SelectField, type SelectOption } from '../../../_components/Field';
import { ReadOnlyBadge } from '../../../_components/States';

interface DraftItem {
  productVariantId: string;
  sku: string;
  name: string;
  qty: number;
}

export default function NuevoTraspasoPage() {
  const router = useRouter();
  const can = useCan();
  const canCreate = can('inventario', 'crear');
  const warehouses = useAsyncData(() => listWarehouses({ pageSize: 100 }));

  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
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

  function addVariant(v: VariantPick) {
    setItems((prev) => {
      if (prev.some((it) => it.productVariantId === v.id)) return prev; // evita duplicados
      return [...prev, { productVariantId: v.id, sku: v.sku, name: v.name, qty: 1 }];
    });
  }

  function setQty(id: string, raw: string) {
    const qty = Math.max(1, Math.round(Number(raw) || 0));
    setItems((prev) => prev.map((it) => (it.productVariantId === id ? { ...it, qty } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.productVariantId !== id));
  }

  const sameWarehouse = Boolean(fromWarehouseId) && fromWarehouseId === toWarehouseId;
  const validationError = !fromWarehouseId
    ? 'Selecciona el almacén de origen.'
    : !toWarehouseId
      ? 'Selecciona el almacén de destino.'
      : sameWarehouse
        ? 'El origen y el destino deben ser distintos.'
        : items.length === 0
          ? 'Agrega al menos una partida.'
          : items.some((it) => !(it.qty > 0))
            ? 'Cada partida requiere una cantidad mayor a 0.'
            : null;

  const canSubmit = canCreate && !validationError && !saving;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await createTransfer({
        fromWarehouseId,
        toWarehouseId,
        notas: notas.trim() || undefined,
        items: items.map((it) => ({ productVariantId: it.productVariantId, qty: it.qty })),
      });
      router.push(`/panel/inventario/traspasos/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el traspaso.');
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Nuevo traspaso</h2>
          <p className="panel-page-sub">Crea un traspaso entre almacenes en borrador.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/inventario/traspasos">
          Volver
        </Link>
      </div>

      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <fieldset disabled={!canCreate} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="panel-form-grid">
          <SelectField
            label="Almacén origen"
            name="fromWarehouseId"
            value={fromWarehouseId}
            onChange={setFromWarehouseId}
            options={warehouseOpts}
            placeholder="Selecciona origen…"
            required
          />
          <SelectField
            label="Almacén destino"
            name="toWarehouseId"
            value={toWarehouseId}
            onChange={setToWarehouseId}
            options={warehouseOpts}
            placeholder="Selecciona destino…"
            required
            error={sameWarehouse ? 'Debe ser distinto al origen.' : undefined}
          />
        </div>

        <div className="panel-field">
          <span className="panel-field-label">Partidas</span>
          <ProductPicker onPick={addVariant} disabled={!canCreate} />
        </div>

        {items.length > 0 && (
          <div className="panel-table-wrap" style={{ marginTop: 'var(--sp-2)' }}>
            <table className="panel-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th className="panel-table-num">Cantidad</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.productVariantId}>
                    <td>{it.sku}</td>
                    <td>{it.name}</td>
                    <td className="panel-table-num">
                      <input
                        type="number"
                        className="panel-input f1-num"
                        min={1}
                        step={1}
                        value={it.qty}
                        aria-label={`Cantidad de ${it.name}`}
                        onChange={(e) => setQty(it.productVariantId, e.target.value)}
                      />
                    </td>
                    <td className="panel-table-num">
                      <button
                        type="button"
                        className="pbtn pbtn--ghost pbtn--sm"
                        onClick={() => removeItem(it.productVariantId)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="panel-field" style={{ marginTop: 'var(--sp-2)' }}>
          <label className="panel-field-label" htmlFor="transfer-notas">
            Notas
          </label>
          <textarea
            id="transfer-notas"
            className="panel-textarea"
            value={notas}
            rows={3}
            placeholder="Referencias, motivo del traspaso…"
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
          onClick={() => router.push('/panel/inventario/traspasos')}
          disabled={saving}
        >
          Cancelar
        </button>
        <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
          {saving ? 'Guardando…' : 'Crear traspaso'}
        </button>
      </div>
    </div>
  );
}
