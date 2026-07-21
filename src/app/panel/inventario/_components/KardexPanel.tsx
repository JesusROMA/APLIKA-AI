'use client';

/**
 * Panel lateral con el kardex (movimientos) de una variante en un almacén.
 * Muestra cantidad con signo, costo unitario, costo promedio y saldo corridos.
 * Solo lectura (inventario/ver); carga la página más reciente del kardex.
 */

import type { StockRow, MovementType } from '@/lib/types/erp-inventario';
import { getKardex } from '../../_lib/inventario';
import { useAsyncData } from '../../_lib/hooks';
import { Drawer } from '../../_components/Drawer';
import { Spinner, ErrorState, EmptyState, Badge } from '../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

const TYPE_LABEL: Record<MovementType, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
};
const TYPE_TONE: Record<MovementType, 'on' | 'off' | 'blue'> = {
  entrada: 'on',
  salida: 'off',
  ajuste: 'blue',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

export function KardexPanel({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const kardex = useAsyncData(() =>
    getKardex({ variantId: row.variantId, warehouseId: row.warehouseId, pageSize: 100 }),
  );
  const rows = kardex.data?.data ?? [];

  return (
    <Drawer open title={`Kardex · ${row.sku}`} onClose={onClose}>
      <p className="panel-page-sub" style={{ marginBottom: 'var(--sp-2)' }}>
        {row.name} — {row.warehouseName}
      </p>

      {kardex.loading ? (
        <Spinner label="Cargando kardex…" />
      ) : kardex.error ? (
        <ErrorState message={kardex.error} onRetry={kardex.reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin movimientos"
          message="Esta variante no tiene movimientos en este almacén."
        />
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th className="panel-table-num">Cant.</th>
                <th className="panel-table-num">Costo unit.</th>
                <th className="panel-table-num">Costo prom.</th>
                <th className="panel-table-num">Saldo</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td>{fmtDate(k.date)}</td>
                  <td>
                    <Badge tone={TYPE_TONE[k.type]}>{TYPE_LABEL[k.type]}</Badge>
                  </td>
                  <td className="panel-table-num">{k.qty > 0 ? `+${k.qty}` : k.qty}</td>
                  <td className="panel-table-num">
                    {k.unitCost == null ? '—' : MXN.format(k.unitCost)}
                  </td>
                  <td className="panel-table-num">
                    {k.avgCostAfter == null ? '—' : MXN.format(k.avgCostAfter)}
                  </td>
                  <td className="panel-table-num">{k.balanceAfter ?? '—'}</td>
                  <td>{k.reason ?? (k.refType ? `(${k.refType})` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}
