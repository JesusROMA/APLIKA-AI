'use client';

/**
 * Editor de partidas de requisición (F6 · Tanda B, módulo `compras`).
 * ProductPicker para agregar variantes + partida libre (nombre manual); por
 * partida: cantidad y costo estimado. Muestra importe estimado por línea y total
 * estimado (referencia informativa; la OC recalcula al convertir). Componente
 * controlado: el padre posee el arreglo de líneas.
 */

import type { VariantPick } from '@/lib/types/erp-ventas';
import { round2 } from '@/lib/erp/totals';
import { ProductPicker } from '../../../_components/ProductPicker';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export interface ReqEditorLine {
  /** Clave local estable para React (no viaja al servidor). */
  key: string;
  productVariantId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  estimatedCost: number;
}

export function reqLineTotal(line: ReqEditorLine): number {
  return round2(line.qty * line.estimatedCost);
}

export function reqEditorTotal(lines: ReqEditorLine[]): number {
  return round2(lines.reduce((s, l) => s + reqLineTotal(l), 0));
}

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `req-${Date.now()}-${seq}`;
}

interface Props {
  value: ReqEditorLine[];
  onChange: (lines: ReqEditorLine[]) => void;
  disabled?: boolean;
}

export function ReqLinesEditor({ value, onChange, disabled = false }: Props) {
  function addVariant(v: VariantPick) {
    if (v.id && value.some((l) => l.productVariantId === v.id)) return;
    onChange([
      ...value,
      {
        key: nextKey(),
        productVariantId: v.id,
        sku: v.sku,
        name: v.name,
        qty: 1,
        estimatedCost: 0,
      },
    ]);
  }

  function addFreeLine() {
    onChange([
      ...value,
      { key: nextKey(), productVariantId: null, sku: null, name: '', qty: 1, estimatedCost: 0 },
    ]);
  }

  function patch(key: string, changes: Partial<ReqEditorLine>) {
    onChange(value.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  }

  function remove(key: string) {
    onChange(value.filter((l) => l.key !== key));
  }

  const total = reqEditorTotal(value);

  return (
    <div>
      <div className="panel-field">
        <span className="panel-field-label">Partidas</span>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 260 }}>
            <ProductPicker onPick={addVariant} disabled={disabled} />
          </div>
          <button type="button" className="pbtn pbtn--ghost" onClick={addFreeLine} disabled={disabled}>
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
                <th className="panel-table-num">Costo estimado</th>
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
                      onChange={(e) => patch(l.key, { qty: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </td>
                  <td className="panel-table-num">
                    <input
                      type="number"
                      className="panel-input f1-num"
                      min={0}
                      step="any"
                      value={l.estimatedCost}
                      aria-label={`Costo estimado de ${l.name || 'partida'}`}
                      disabled={disabled}
                      onChange={(e) =>
                        patch(l.key, { estimatedCost: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </td>
                  <td className="panel-table-num">{MXN.format(reqLineTotal(l))}</td>
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
                  <strong>Total estimado</strong>
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
