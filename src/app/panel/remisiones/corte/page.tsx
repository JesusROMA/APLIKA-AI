'use client';

/**
 * Corte del día: remisiones cobradas de una fecha agregadas por forma de pago,
 * con total general. El endpoint ya exige remisiones/ver; aquí usamos useCan
 * solo para la UX.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { CorteDelDiaRow } from '@/lib/types/erp-ventas';
import { getCorteDelDia } from '../../_lib/remisiones';
import { useCan } from '../../_components/session';
import { EmptyState, ErrorState, ReadOnlyBadge, TableSkeleton } from '../../_components/States';
import { MXN, paymentLabel } from '../_components/labels';

const today = () => new Date().toISOString().slice(0, 10);

export default function CortePage() {
  const can = useCan();
  const canView = can('remisiones', 'ver');
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<CorteDelDiaRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!canView) return;
    let alive = true;
    setLoading(true);
    setError(null);
    getCorteDelDia(date)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'No se pudo cargar el corte.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [date, reloadKey, canView]);

  const grandCount = (rows ?? []).reduce((s, r) => s + r.count, 0);
  const grandTotal = (rows ?? []).reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Corte del día</h2>
          <p className="panel-page-sub">Remisiones cobradas agrupadas por forma de pago.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/remisiones">
          ← Remisiones
        </Link>
      </div>

      {!canView ? (
        <div className="panel-card" style={{ padding: 'var(--sp-4)' }}>
          <ReadOnlyBadge />
          <p className="panel-page-sub" style={{ marginTop: 'var(--sp-2)' }}>
            No tienes permiso para ver el corte del día.
          </p>
        </div>
      ) : (
        <>
          <div className="panel-toolbar">
            <div className="panel-field" style={{ margin: 0 }}>
              <label className="panel-field-label" htmlFor="corte-date">
                Fecha
              </label>
              <input
                id="corte-date"
                type="date"
                className="panel-input"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value || today())}
              />
            </div>
          </div>

          {loading ? (
            <TableSkeleton cols={3} />
          ) : error ? (
            <div className="panel-table-wrap">
              <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
            </div>
          ) : (rows ?? []).length === 0 ? (
            <div className="panel-table-wrap">
              <EmptyState
                title="Sin cobros"
                message="No hay remisiones cobradas en la fecha seleccionada."
              />
            </div>
          ) : (
            <div className="panel-table-wrap">
              <table className="panel-table">
                <thead>
                  <tr>
                    <th>Forma de pago</th>
                    <th className="panel-table-num">Remisiones</th>
                    <th className="panel-table-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((r) => (
                    <tr key={r.paymentMethod}>
                      <td>{paymentLabel(r.paymentMethod)}</td>
                      <td className="panel-table-num">{r.count}</td>
                      <td className="panel-table-num">{MXN.format(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      <strong>Total general</strong>
                    </td>
                    <td className="panel-table-num">
                      <strong>{grandCount}</strong>
                    </td>
                    <td className="panel-table-num">
                      <strong>{MXN.format(grandTotal)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
