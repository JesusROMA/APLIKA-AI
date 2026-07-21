'use client';

/**
 * Inventario · Valuación (F2 · Tanda B). Reporte de valor de inventario por
 * almacén (SKUs con existencia, unidades, valor a costo promedio) + total
 * general. Solo lectura (inventario/ver).
 */

import type { ValuationRow } from '@/lib/types/erp-inventario';
import { getValuacion } from '../../_lib/inventario';
import { useAsyncData } from '../../_lib/hooks';
import { Spinner, ErrorState, EmptyState } from '../../_components/States';
import { InventarioNav } from '../_components/InventarioNav';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const NUM = new Intl.NumberFormat('es-MX');

export default function ValuacionPage() {
  const val = useAsyncData(getValuacion);
  const rows: ValuationRow[] = val.data?.data ?? [];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Valuación de inventario</h2>
          <p className="panel-page-sub">Valor del inventario por almacén (costo promedio).</p>
        </div>
      </div>

      <InventarioNav />

      {val.loading ? (
        <Spinner label="Calculando valuación…" />
      ) : val.error ? (
        <ErrorState message={val.error} onRetry={val.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="Sin inventario" message="Aún no hay existencias que valuar." />
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Almacén</th>
                <th className="panel-table-num">SKUs con existencia</th>
                <th className="panel-table-num">Unidades</th>
                <th className="panel-table-num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.warehouseId}>
                  <td>
                    <strong>{r.warehouseName}</strong>
                  </td>
                  <td className="panel-table-num">{NUM.format(r.skuCount)}</td>
                  <td className="panel-table-num">{NUM.format(r.units)}</td>
                  <td className="panel-table-num">{MXN.format(r.value)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  <strong>Total general</strong>
                </td>
                <td className="panel-table-num">
                  <strong>{MXN.format(val.data?.totalValue ?? 0)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
