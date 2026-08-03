'use client';

/**
 * Editor de partidas de compra (F5 · Tanda B, módulo `compras`). ProductPicker
 * para agregar variantes + partida libre (nombre manual); por partida: cantidad,
 * costo unitario editable e IVA. Calcula importe por línea y totales en vivo con
 * las MISMAS fórmulas del servidor (`round2`). Componente controlado: el padre
 * posee el arreglo de líneas.
 */

import type { VariantPick } from '@/lib/types/erp-ventas';
import { round2 } from '@/lib/erp/totals';
import { ProductPicker } from '../../_components/ProductPicker';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** IVA disponibles en el selector (fracción, no porcentaje). */
const IVA_OPTIONS = [
  { value: 0.16, label: '16%' },
  { value: 0.08, label: '8%' },
  { value: 0, label: '0% / Exento' },
];

export interface POEditorLine {
  /** Clave local estable para React (no viaja al servidor). */
  key: string;
  productVariantId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unitCost: number;
  ivaRate: number;
}

export function lineTotalOf(line: POEditorLine): number {
  return round2(line.qty * line.unitCost);
}

export function poEditorTotals(lines: POEditorLine[]): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const subtotal = round2(lines.reduce((s, l) => s + lineTotalOf(l), 0));
  const tax = round2(lines.reduce((s, l) => s + round2(lineTotalOf(l) * l.ivaRate), 0));
  return { subtotal, tax, total: round2(subtotal + tax) };
}

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `pol-${Date.now()}-${seq}`;
}

interface Props {
  value: POEditorLine[];
  onChange: (lines: POEditorLine[]) => void;
  disabled?: boolean;
}

export function POLinesEditor({ value, onChange, disabled = false }: Props) {
  function addVariant(v: VariantPick) {
    // Evita duplicar la misma variante; si ya está, no hace nada.
    if (v.id && value.some((l) => l.productVariantId === v.id)) return;
    onChange([
      ...value,
      {
        key: nextKey(),
        productVariantId: v.id,
        sku: v.sku,
        name: v.name,
        qty: 1,
        unitCost: 0,
        ivaRate: v.ivaRate ?? 0.16,
      },
    ]);
  }

  function addFreeLine() {
    onChange([
      ...value,
      {
        key: nextKey(),
        productVariantId: null,
        sku: null,
        name: '',
        qty: 1,
        unitCost: 0,
        ivaRate: 0.16,
      },
    ]);
  }

  function patch(key: string, changes: Partial<POEditorLine>) {
    onChange(value.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  }

  function remove(key: string) {
    onChange(value.filter((l) => l.key !== key));
  }

  const totals = poEditorTotals(value);

  return (
    <div>
      <div className="panel-field">
        <span className="panel-field-label">Partidas</span>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
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

      {value.length > 0 && (
        <div className="panel-table-wrap" style={{ marginTop: 'var(--sp-2)' }}>
          <table className="panel-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th className="panel-table-num">Cantidad</th>
                <th className="panel-table-num">Costo unit.</th>
                <th className="panel-table-num">IVA</th>
                <th className="panel-table-num">Importe</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {value.map((l) => (
                <tr key={l.key}>
                  <td>{l.sku ?? '—'}</td>
                  <td>
                    {l.productVariantId ? (
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
                      step="any"
                      value={l.qty}
                      aria-label={`Cantidad de ${l.name || 'partida'}`}
                      disabled={disabled}
                      onChange={(e) =>
                        patch(l.key, { qty: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
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
                  <td className="panel-table-num">
                    <select
                      className="panel-select"
                      value={l.ivaRate}
                      aria-label={`IVA de ${l.name || 'partida'}`}
                      disabled={disabled}
                      onChange={(e) => patch(l.key, { ivaRate: Number(e.target.value) })}
                    >
                      {IVA_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
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
                <td colSpan={5} className="panel-table-num">
                  <strong>Subtotal</strong>
                </td>
                <td className="panel-table-num">{MXN.format(totals.subtotal)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} className="panel-table-num">
                  <strong>IVA</strong>
                </td>
                <td className="panel-table-num">{MXN.format(totals.tax)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} className="panel-table-num">
                  <strong>Total</strong>
                </td>
                <td className="panel-table-num">
                  <strong>{MXN.format(totals.total)}</strong>
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

/** Crea una línea de editor a partir de datos mínimos (útil en el alta). */
export { nextKey as newLineKey };
