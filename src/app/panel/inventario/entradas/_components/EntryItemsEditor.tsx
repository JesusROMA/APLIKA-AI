'use client';

/**
 * Editor de partidas de una orden de entrada (F6 · Tanda B, módulo
 * `inventario`). Dos modos:
 *  - Manual: ProductPicker + partida libre; cantidad y costo unitario editables.
 *  - Desde OC: partidas precargadas (con `purchaseOrderItemId` y costo de la OC);
 *    la cantidad es editable pero acotada al pendiente (`maxQty`).
 * Componente controlado: el padre posee el arreglo de líneas. Muestra el importe
 * por línea y el total en vivo (qty * costo).
 */

import type { VariantPick } from '@/lib/types/erp-ventas';
import { round2 } from '@/lib/erp/totals';
import { ProductPicker } from '../../../_components/ProductPicker';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export interface EntryEditorLine {
  /** Clave local estable para React (no viaja al servidor). */
  key: string;
  productVariantId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unitCost: number;
  /** Liga a la partida de la OC de origen (modo compra). */
  purchaseOrderItemId: string | null;
  /** Tope de cantidad = pendiente de la OC (sólo modo compra). */
  maxQty?: number;
}

export function lineTotalOf(line: EntryEditorLine): number {
  return round2(line.qty * line.unitCost);
}

export function entryEditorTotal(lines: EntryEditorLine[]): number {
  return round2(lines.reduce((s, l) => s + lineTotalOf(l), 0));
}

let seq = 0;
export function newLineKey(): string {
  seq += 1;
  return `eol-${Date.now()}-${seq}`;
}

interface Props {
  value: EntryEditorLine[];
  onChange: (lines: EntryEditorLine[]) => void;
  /** Muestra ProductPicker + partida libre (modo manual). */
  allowAdd?: boolean;
  disabled?: boolean;
}

export function EntryItemsEditor({ value, onChange, allowAdd = true, disabled = false }: Props) {
  function addVariant(v: VariantPick) {
    if (v.id && value.some((l) => l.productVariantId === v.id)) return;
    onChange([
      ...value,
      {
        key: newLineKey(),
        productVariantId: v.id,
        sku: v.sku,
        name: v.name,
        qty: 1,
        unitCost: 0,
        purchaseOrderItemId: null,
      },
    ]);
  }

  function addFreeLine() {
    onChange([
      ...value,
      {
        key: newLineKey(),
        productVariantId: null,
        sku: null,
        name: '',
        qty: 1,
        unitCost: 0,
        purchaseOrderItemId: null,
      },
    ]);
  }

  function patch(key: string, changes: Partial<EntryEditorLine>) {
    onChange(value.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  }

  function remove(key: string) {
    onChange(value.filter((l) => l.key !== key));
  }

  const total = entryEditorTotal(value);

  return (
    <div>
      {allowAdd && (
        <div className="panel-field">
          <span className="panel-field-label">Partidas</span>
          <div
            style={{ display: 'flex', gap: 'var(--sp-1)', alignItems: 'flex-start', flexWrap: 'wrap' }}
          >
            <div style={{ flex: '1 1 320px', minWidth: 260 }}>
              <ProductPicker onPick={addVariant} disabled={disabled} />
            </div>
            <button
              type="button"
              className="pbtn pbtn--ghost"
              onClick={addFreeLine}
              disabled={disabled}
            >
              + Partida libre
            </button>
          </div>
        </div>
      )}

      {value.length > 0 && (
        <div className="panel-table-wrap" style={{ marginTop: 'var(--sp-2)' }}>
          <table className="panel-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th className="panel-table-num">Cantidad</th>
                <th className="panel-table-num">Costo unit.</th>
                <th className="panel-table-num">Importe</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {value.map((l) => (
                <tr key={l.key}>
                  <td>{l.sku ?? '—'}</td>
                  <td>
                    {l.productVariantId || l.purchaseOrderItemId ? (
                      l.name
                    ) : (
                      <input
                        type="text"
                        className="panel-input"
                        value={l.name}
                        placeholder="Concepto…"
                        aria-label="Nombre de la partida libre"
                        disabled={disabled}
                        onChange={(e) => patch(l.key, { name: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="panel-table-num">
                    <input
                      type="number"
                      className="panel-input f1-num"
                      min={0.001}
                      max={l.maxQty}
                      step="any"
                      value={l.qty}
                      aria-label={`Cantidad de ${l.name || 'partida'}`}
                      disabled={disabled}
                      onChange={(e) => {
                        let q = Math.max(0, Number(e.target.value) || 0);
                        if (l.maxQty !== undefined) q = Math.min(q, l.maxQty);
                        patch(l.key, { qty: q });
                      }}
                    />
                    {l.maxQty !== undefined && (
                      <div className="panel-field-hint">Pendiente: {l.maxQty}</div>
                    )}
                  </td>
                  <td className="panel-table-num">
                    <input
                      type="number"
                      className="panel-input f1-num"
                      min={0}
                      step="any"
                      value={l.unitCost}
                      aria-label={`Costo unitario de ${l.name || 'partida'}`}
                      disabled={disabled}
                      onChange={(e) =>
                        patch(l.key, { unitCost: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </td>
                  <td className="panel-table-num">{MXN.format(lineTotalOf(l))}</td>
                  <td className="panel-table-num">
                    <button
                      type="button"
                      className="pbtn pbtn--ghost pbtn--sm"
                      onClick={() => remove(l.key)}
                      disabled={disabled}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="panel-table-num">
                  <strong>Total</strong>
                </td>
                <td className="panel-table-num">
                  <strong>{MXN.format(total)}</strong>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
