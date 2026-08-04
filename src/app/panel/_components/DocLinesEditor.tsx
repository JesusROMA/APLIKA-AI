'use client';

/**
 * DocLinesEditor — editor de partidas COMPARTIDO por cotización/pedido/
 * remisión/factura (pieza central F1). Calcula importes y totales con las
 * fórmulas puras de src/lib/erp/totals.ts (mismas que el servidor). No conoce
 * ningún documento en concreto: el padre controla `lines` y recibe `onChange`.
 */

import { useId } from 'react';
import type { DocLineInput, VariantPick } from '@/lib/types/erp-ventas';
import { computeTotals, lineTotalOf } from '@/lib/erp/totals';
import { ProductPicker } from './ProductPicker';

interface Props {
  customerId: string | null;
  /** F8: lista de precios seleccionada (manda sobre la del cliente en el picker). */
  priceListId?: string | null;
  /** F8: almacén del documento — el picker muestra el stock de ese almacén. */
  warehouseId?: string | null;
  lines: DocLineInput[];
  onChange: (lines: DocLineInput[]) => void;
  descuentoGlobalPct?: number;
  onDescuentoGlobalChange?: (pct: number) => void;
  readOnly?: boolean;
  /** Pedidos: muestra columna "entregado" (solo lectura). */
  showDelivered?: boolean;
  /** Cantidad entregada por línea (índice paralelo a `lines`). */
  deliveredByIndex?: number[];
}

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const IVA_DEFAULT = 0.16;

/** Normaliza un valor numérico opcional de la partida. */
function num(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** ¿Es línea libre (sin variante) y por tanto de descripción editable? */
function isFreeLine(l: DocLineInput): boolean {
  return l.productVariantId == null;
}

export function DocLinesEditor({
  customerId,
  priceListId,
  warehouseId,
  lines,
  onChange,
  descuentoGlobalPct = 0,
  onDescuentoGlobalChange,
  readOnly = false,
  showDelivered = false,
  deliveredByIndex,
}: Props) {
  const descGlobalId = useId();
  const computed = lines.map((l) => ({
    lineTotal: lineTotalOf(num(l.qty), num(l.unitPrice), num(l.discountPct)),
    ivaRate: num(l.ivaRate),
  }));
  const totals = computeTotals(computed, descuentoGlobalPct);

  function update(index: number, patch: Partial<DocLineInput>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function remove(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  function addFromVariant(v: VariantPick) {
    const line: DocLineInput = {
      productVariantId: v.id,
      sku: v.sku,
      name: v.name,
      unitPrice: v.price,
      ivaRate: v.ivaRate,
      qty: 1,
      discountPct: 0,
    };
    onChange([...lines, line]);
  }

  function addFreeLine() {
    const line: DocLineInput = {
      productVariantId: null,
      sku: null,
      name: '',
      unitPrice: 0,
      ivaRate: IVA_DEFAULT,
      qty: 1,
      discountPct: 0,
    };
    onChange([...lines, line]);
  }

  // Nº de columnas: SKU/Desc, Cant, Precio, Desc%, Importe (+Entregado) (+acción)
  const colCount = 5 + (showDelivered ? 1 : 0) + (readOnly ? 0 : 1);

  return (
    <div className="f1-lines">
      {!readOnly && (
        <div className="f1-lines-tools">
          <div className="f1-lines-tools-picker">
            <ProductPicker
              customerId={customerId}
              priceListId={priceListId}
              warehouseId={warehouseId}
              onPick={addFromVariant}
            />
          </div>
          <button type="button" className="pbtn pbtn--ghost" onClick={addFreeLine}>
            + Línea libre
          </button>
        </div>
      )}

      <div className="panel-table-wrap">
        <table className="panel-table f1-lines-table">
          <thead>
            <tr>
              <th>SKU / Descripción</th>
              <th className="panel-table-num">Cantidad</th>
              <th className="panel-table-num">Precio unit.</th>
              <th className="panel-table-num">Desc. %</th>
              {showDelivered && <th className="panel-table-num">Entregado</th>}
              <th className="panel-table-num">Importe</th>
              {!readOnly && <th aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="f1-lines-empty">
                  Agrega productos para cotizar/vender.
                </td>
              </tr>
            ) : (
              lines.map((l, i) => {
                const importe = lineTotalOf(num(l.qty), num(l.unitPrice), num(l.discountPct));
                const free = isFreeLine(l);
                return (
                  <tr key={i}>
                    <td>
                      {l.sku && <span className="f1-line-sku">{l.sku}</span>}
                      {readOnly || !free ? (
                        <span className="f1-line-name">{l.name || '—'}</span>
                      ) : (
                        <input
                          type="text"
                          className="panel-input f1-line-name-input"
                          placeholder="Descripción de la partida"
                          value={l.name ?? ''}
                          aria-label={`Descripción de la partida ${i + 1}`}
                          onChange={(e) => update(i, { name: e.target.value })}
                        />
                      )}
                    </td>
                    <td className="panel-table-num">
                      {readOnly ? (
                        num(l.qty)
                      ) : (
                        <input
                          type="number"
                          className="panel-input f1-num"
                          value={l.qty}
                          min={0.001}
                          step="any"
                          aria-label={`Cantidad de la partida ${i + 1}`}
                          onChange={(e) =>
                            update(i, { qty: e.target.value === '' ? 0 : Number(e.target.value) })
                          }
                        />
                      )}
                    </td>
                    <td className="panel-table-num">
                      {readOnly ? (
                        MXN.format(num(l.unitPrice))
                      ) : (
                        <input
                          type="number"
                          className="panel-input f1-num"
                          value={l.unitPrice ?? 0}
                          min={0}
                          step="any"
                          aria-label={`Precio unitario de la partida ${i + 1}`}
                          onChange={(e) =>
                            update(i, {
                              unitPrice: e.target.value === '' ? 0 : Number(e.target.value),
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="panel-table-num">
                      {readOnly ? (
                        `${num(l.discountPct)}%`
                      ) : (
                        <input
                          type="number"
                          className="panel-input f1-num"
                          value={l.discountPct ?? 0}
                          min={0}
                          max={100}
                          step="any"
                          aria-label={`Descuento de la partida ${i + 1}`}
                          onChange={(e) =>
                            update(i, {
                              discountPct: e.target.value === '' ? 0 : Number(e.target.value),
                            })
                          }
                        />
                      )}
                    </td>
                    {showDelivered && (
                      <td className="panel-table-num">
                        {num(deliveredByIndex?.[i])} / {num(l.qty)}
                      </td>
                    )}
                    <td className="panel-table-num f1-line-importe">{MXN.format(importe)}</td>
                    {!readOnly && (
                      <td className="panel-table-num">
                        <button
                          type="button"
                          className="pbtn pbtn--ghost pbtn--sm f1-line-del"
                          onClick={() => remove(i)}
                          aria-label={`Eliminar partida ${i + 1}`}
                          title="Eliminar"
                        >
                          🗑
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="f1-totals">
        {onDescuentoGlobalChange && !readOnly && (
          <div className="f1-totals-row f1-totals-row--input">
            <label className="f1-totals-label" htmlFor={descGlobalId}>
              Descuento global %
            </label>
            <input
              id={descGlobalId}
              type="number"
              className="panel-input f1-num"
              value={descuentoGlobalPct}
              min={0}
              max={100}
              step="any"
              onChange={(e) =>
                onDescuentoGlobalChange(e.target.value === '' ? 0 : Number(e.target.value))
              }
            />
          </div>
        )}
        <div className="f1-totals-row">
          <span className="f1-totals-label">Subtotal</span>
          <span className="f1-totals-value">{MXN.format(totals.subtotal)}</span>
        </div>
        <div className="f1-totals-row">
          <span className="f1-totals-label">Descuento</span>
          <span className="f1-totals-value">−{MXN.format(totals.descuento)}</span>
        </div>
        <div className="f1-totals-row">
          <span className="f1-totals-label">IVA</span>
          <span className="f1-totals-value">{MXN.format(totals.tax)}</span>
        </div>
        <div className="f1-totals-row f1-totals-row--grand">
          <span className="f1-totals-label">Total</span>
          <span className="f1-totals-value">{MXN.format(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}
