'use client';

/**
 * Drawer de alta de movimiento manual de inventario: SALIDAS y AJUSTES.
 * Las ENTRADAS ya no se registran aquí — pasan por Órdenes de entrada (F6).
 * El servidor es la autoridad (RBAC inventario/crear + costeo/kardex).
 */

import { useEffect, useState } from 'react';
import type { WarehouseRow } from '@/lib/types/erp';
import type { VariantPick } from '@/lib/types/erp-ventas';
import type { MovementType } from '@/lib/types/erp-inventario';
import { listWarehouses } from '../../_lib/api';
import { createMovement } from '../../_lib/inventario';
import { useAsyncData } from '../../_lib/hooks';
import { Drawer } from '../../_components/Drawer';
import { ProductPicker } from '../../_components/ProductPicker';
import { SelectField, NumberField, TextField } from '../../_components/Field';
import { ReadOnlyBadge } from '../../_components/States';

const TYPE_OPTIONS = [
  { value: 'salida', label: 'Salida (−)' },
  { value: 'ajuste', label: 'Ajuste (±)' },
];

export function MovementDrawer({
  canCreate,
  onClose,
  onSaved,
}: {
  canCreate: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const warehouses = useAsyncData(() => listWarehouses({ pageSize: 100 }));

  const [variant, setVariant] = useState<VariantPick | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState<MovementType>('salida');
  const [qty, setQty] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Preselecciona el almacén predeterminado (o el primero) al cargar la lista.
  const whList: WarehouseRow[] = warehouses.data?.data ?? [];
  useEffect(() => {
    if (!warehouseId && whList.length > 0) {
      setWarehouseId((whList.find((w) => w.isDefault) ?? whList[0]).id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whList.length]);

  const whOptions = whList.map((w) => ({ value: w.id, label: w.name }));

  const isAjuste = type === 'ajuste';
  const qtyInvalid =
    qty === '' || !Number.isInteger(qty) || (isAjuste ? qty === 0 : qty <= 0);
  const qtyError =
    qty === '' || !qtyInvalid
      ? null
      : isAjuste
        ? 'Captura una cantidad entera distinta de 0 (usa signo − para merma).'
        : 'La cantidad debe ser un entero mayor a 0.';

  const canSubmit = canCreate && !!variant && !!warehouseId && !qtyInvalid && !saving;

  const submit = async () => {
    if (!canSubmit || !variant) return;
    setSaving(true);
    setServerError(null);
    try {
      await createMovement({
        productVariantId: variant.id,
        warehouseId,
        type,
        qty: Number(qty),
        reason: reason.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'No se pudo registrar el movimiento.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title="Registrar movimiento"
      onClose={onClose}
      footer={
        <>
          {!canCreate && <ReadOnlyBadge />}
          <button type="button" className="pbtn pbtn--ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="pbtn pbtn--primary"
            disabled={!canSubmit}
            onClick={submit}
          >
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </>
      }
    >
      {serverError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {serverError}
        </p>
      )}

      <fieldset disabled={!canCreate} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="panel-field">
          <span className="panel-field-label">
            Producto <span className="panel-field-req" aria-hidden="true">*</span>
          </span>
          {variant ? (
            <div
              className="panel-input"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-1)' }}
            >
              <span>
                <strong>{variant.sku}</strong> · {variant.name}
              </span>
              <button
                type="button"
                className="pbtn pbtn--ghost pbtn--sm"
                onClick={() => setVariant(null)}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <ProductPicker onPick={setVariant} disabled={!canCreate} />
          )}
        </div>

        <SelectField
          label="Almacén"
          name="warehouseId"
          value={warehouseId}
          onChange={setWarehouseId}
          options={whOptions}
          required
          error={warehouses.error}
          hint={warehouses.loading ? 'Cargando almacenes…' : undefined}
        />

        <SelectField
          label="Tipo de movimiento"
          name="type"
          value={type}
          onChange={(v) => setType(v as MovementType)}
          options={TYPE_OPTIONS}
          required
        />

        <NumberField
          label="Cantidad"
          name="qty"
          value={qty}
          onChange={setQty}
          step={1}
          min={isAjuste ? undefined : 1}
          required
          error={qtyError}
          hint={isAjuste ? 'Entero con signo (− merma / + sobrante).' : 'Entero mayor a 0.'}
        />

        <TextField
          label="Motivo"
          name="reason"
          value={reason}
          onChange={setReason}
          hint="Opcional. Referencia del ajuste o movimiento."
        />
      </fieldset>
    </Drawer>
  );
}
