'use client';

/**
 * Alta de orden de entrada (F6 · Tanda B, módulo `inventario`). Dos caminos:
 *  - `?poId=<uuid>`: precarga desde una OC → origin='compra', almacén de la OC y
 *    las partidas PENDIENTES (qty - recibido) con costo de la OC; se guarda con
 *    `purchaseOrderId` y `purchaseOrderItemId` por línea (trazabilidad).
 *  - Sin `poId`: alta manual → almacén + origin (manual/ajuste/devolución) +
 *    editor de partidas (ProductPicker + cantidad + costo unitario).
 * Se crea en borrador; al guardar navega al detalle. El server es la autoridad
 * (RLS + guards). La OE NO afecta inventario hasta que se aplica.
 */

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { EntryOrigin } from '@/lib/types/erp-compras';
import { createEntryOrder } from '../../../_lib/entradas';
import { getPurchaseOrder } from '../../../_lib/compras';
import { listWarehouses } from '../../../_lib/api';
import { useCan } from '../../../_components/session';
import { SelectField, type SelectOption } from '../../../_components/Field';
import { ReadOnlyBadge, Spinner } from '../../../_components/States';
import {
  EntryItemsEditor,
  newLineKey,
  type EntryEditorLine,
} from '../_components/EntryItemsEditor';

const MANUAL_ORIGINS: { value: EntryOrigin; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'ajuste', label: 'Ajuste' },
  { value: 'devolucion', label: 'Devolución' },
];

function NuevaEntradaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poId = searchParams.get('poId') || null;
  const fromPo = Boolean(poId);

  const can = useCan();
  const canCreate = can('inventario', 'crear');

  const [warehouses, setWarehouses] = useState<SelectOption[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [origin, setOrigin] = useState<EntryOrigin>(fromPo ? 'compra' : 'manual');
  const [notas, setNotas] = useState('');
  const [lines, setLines] = useState<EntryEditorLine[]>([]);
  const [preloading, setPreloading] = useState(fromPo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catálogo de almacenes (selector en modo manual y respaldo en modo compra).
  useEffect(() => {
    let alive = true;
    listWarehouses({ pageSize: 100 })
      .then((res) => {
        if (!alive) return;
        setWarehouses(
          res.data.map((w) => ({
            value: w.id,
            label: w.isDefault ? `${w.name} (predeterminado)` : w.name,
          })),
        );
      })
      .catch(() => {
        /* el guardado revalida en servidor */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Precarga desde la OC.
  useEffect(() => {
    if (!poId) return;
    let alive = true;
    setPreloading(true);
    getPurchaseOrder(poId)
      .then((po) => {
        if (!alive) return;
        setOrigin('compra');
        if (po.warehouseId) setWarehouseId(po.warehouseId);
        const pending = po.items
          .map((it) => {
            const rest = Math.max(0, Number(it.qty) - Number(it.qtyReceived ?? 0));
            return { it, rest };
          })
          .filter(({ rest }) => rest > 0)
          .map(({ it, rest }) => ({
            key: newLineKey(),
            productVariantId: it.productVariantId,
            sku: it.sku,
            name: it.name,
            qty: rest,
            unitCost: it.unitCost,
            purchaseOrderItemId: it.id ?? null,
            maxQty: rest,
          }));
        setLines(pending);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'No se pudo cargar la orden de compra.');
      })
      .finally(() => {
        if (alive) setPreloading(false);
      });
    return () => {
      alive = false;
    };
  }, [poId]);

  const validationError = !warehouseId
    ? 'Selecciona un almacén.'
    : lines.length === 0
      ? 'Agrega al menos una partida.'
      : lines.some((l) => !(l.qty > 0))
        ? 'Cada partida requiere una cantidad mayor a 0.'
        : lines.some((l) => !l.productVariantId && !l.name.trim())
          ? 'Las partidas libres requieren un concepto.'
          : null;

  const canSubmit = canCreate && !validationError && !saving && !preloading;

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { id } = await createEntryOrder({
        warehouseId,
        origin,
        purchaseOrderId: poId,
        notas: notas.trim() || null,
        items: lines.map((l) => ({
          productVariantId: l.productVariantId,
          sku: l.sku,
          name: l.name.trim() || undefined,
          qty: l.qty,
          unitCost: l.unitCost,
          purchaseOrderItemId: l.purchaseOrderItemId,
        })),
      });
      router.push(`/panel/inventario/entradas/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la orden de entrada.');
      setSaving(false);
    }
  }

  if (preloading) return <Spinner label="Cargando orden de compra…" />;

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Nueva orden de entrada</h2>
          <p className="panel-page-sub">
            {fromPo
              ? 'Recepción desde una orden de compra: revisa cantidades y costos, luego aplícala.'
              : 'Registra una entrada manual; se crea en borrador y afecta el inventario al aplicarla.'}
          </p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/inventario/entradas">
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
            label="Almacén de destino"
            name="warehouseId"
            value={warehouseId}
            onChange={setWarehouseId}
            options={warehouses}
            placeholder="Selecciona almacén…"
            required
            hint="Almacén al que entrará la mercancía al aplicar."
          />
          {fromPo ? (
            <div className="panel-field">
              <span className="panel-field-label">Origen</span>
              <span>Compra (desde OC)</span>
            </div>
          ) : (
            <SelectField
              label="Origen"
              name="origin"
              value={origin}
              onChange={(v) => setOrigin(v as EntryOrigin)}
              options={MANUAL_ORIGINS}
            />
          )}
        </div>

        <div style={{ marginTop: 'var(--sp-2)' }}>
          <EntryItemsEditor
            value={lines}
            onChange={setLines}
            allowAdd={!fromPo}
            disabled={!canCreate}
          />
        </div>

        <div className="panel-field" style={{ marginTop: 'var(--sp-2)' }}>
          <label className="panel-field-label" htmlFor="eo-notas">
            Notas
          </label>
          <textarea
            id="eo-notas"
            className="panel-textarea"
            value={notas}
            rows={3}
            placeholder="Referencias, observaciones…"
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
          onClick={() => router.push('/panel/inventario/entradas')}
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

export default function NuevaEntradaPage() {
  return (
    <Suspense fallback={<Spinner label="Cargando…" />}>
      <NuevaEntradaInner />
    </Suspense>
  );
}
