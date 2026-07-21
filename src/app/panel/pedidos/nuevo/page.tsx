'use client';

/**
 * Alta de pedido (F1 · Tanda B, módulo `ordenes`). Reúne las piezas compartidas:
 * CustomerPicker + DocLinesEditor (cantidades ENTERAS — order_items.qty es
 * INTEGER) + almacén/canal/notas. Los totales los pinta DocLinesEditor con las
 * mismas fórmulas del servidor, que es la autoridad. Al guardar navega al detalle.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DocLineInput } from '@/lib/types/erp-ventas';
import { createOrder } from '../../_lib/pedidos';
import { listWarehouses } from '../../_lib/api';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { CustomerPicker } from '../../_components/CustomerPicker';
import { DocLinesEditor } from '../../_components/DocLinesEditor';
import { SelectField, type SelectOption } from '../../_components/Field';
import { ReadOnlyBadge } from '../../_components/States';

const CANAL_OPTS: SelectOption[] = [
  { value: 'mostrador', label: 'Mostrador' },
  { value: 'telefono', label: 'Teléfono' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'web', label: 'Web' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'otro', label: 'Otro' },
];

/** Fuerza cantidades enteras en las partidas (order_items.qty es INTEGER). */
function withIntQty(lines: DocLineInput[]): DocLineInput[] {
  return lines.map((l) => ({ ...l, qty: Math.max(0, Math.round(Number(l.qty) || 0)) }));
}

export default function NuevoPedidoPage() {
  const router = useRouter();
  const can = useCan();
  const canCreate = can('ordenes', 'crear');
  const warehouses = useAsyncData(() => listWarehouses({ pageSize: 100 }));

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [channel, setChannel] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [lines, setLines] = useState<DocLineInput[]>([]);
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

  const hasLines = lines.length > 0;
  const freeLineMissingName = lines.some((l) => !l.productVariantId && !(l.name && l.name.trim()));
  const invalidQty = lines.some((l) => !(Number(l.qty) > 0));
  const validationError = !hasLines
    ? 'Agrega al menos una partida.'
    : freeLineMissingName
      ? 'Las líneas libres requieren descripción.'
      : invalidQty
        ? 'Cada partida requiere una cantidad mayor a 0.'
        : null;

  const canSubmit = canCreate && !validationError && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await createOrder({
        customerId,
        warehouseId: warehouseId || null,
        channel: channel || undefined,
        notes: notes.trim() || undefined,
        lines: withIntQty(lines),
      });
      router.push(`/panel/pedidos/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el pedido.');
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Nuevo pedido</h2>
          <p className="panel-page-sub">Crea una orden de venta en borrador.</p>
        </div>
      </div>

      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <fieldset disabled={!canCreate} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="panel-form-grid">
          <CustomerPicker value={customerId} onChange={(id) => setCustomerId(id)} allowPublico />
          <SelectField
            label="Almacén"
            name="warehouseId"
            value={warehouseId}
            onChange={setWarehouseId}
            options={warehouseOpts}
            placeholder="Sin almacén asignado"
          />
        </div>

        <div className="panel-form-grid">
          <SelectField
            label="Canal"
            name="channel"
            value={channel}
            onChange={setChannel}
            options={CANAL_OPTS}
            placeholder="Sin canal"
          />
        </div>

        <DocLinesEditor
          customerId={customerId}
          lines={lines}
          onChange={(next) => setLines(withIntQty(next))}
        />

        <div className="panel-field">
          <label className="panel-field-label" htmlFor="order-notes">
            Notas
          </label>
          <textarea
            id="order-notes"
            className="panel-textarea"
            value={notes}
            rows={3}
            placeholder="Instrucciones internas, referencias…"
            onChange={(e) => setNotes(e.target.value)}
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
          onClick={() => router.push('/panel/pedidos')}
          disabled={saving}
        >
          Cancelar
        </button>
        <button type="button" className="pbtn pbtn--primary" disabled={!canSubmit} onClick={submit}>
          {saving ? 'Guardando…' : 'Crear pedido'}
        </button>
      </div>
    </div>
  );
}
