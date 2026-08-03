'use client';

/**
 * Reporte de Cuentas por Pagar: facturas de proveedor con saldo > 0, con
 * antigüedad del saldo por bucket y totales por tramo. Solo lectura (compras/ver).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import type { CxpRow } from '@/lib/types/erp-compras';
import { getCxp } from '../../../_lib/cxp';
import { useAsyncData } from '../../../_lib/hooks';
import { useCan } from '../../../_components/session';
import { Badge, Spinner, ErrorState, EmptyState } from '../../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const BUCKETS: CxpRow['bucket'][] = ['0-30', '31-60', '61-90', '90+'];

function bucketTone(b: CxpRow['bucket']): 'on' | 'off' | 'blue' | 'ro' {
  if (b === '0-30') return 'on';
  if (b === '90+') return 'ro';
  return 'blue';
}

export default function ReporteCxpPage() {
  const can = useCan();
  const cxp = useAsyncData(getCxp);

  const rows = useMemo(() => cxp.data ?? [], [cxp.data]);
  const byBucket = useMemo(() => {
    const acc: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const r of rows) acc[r.bucket] += r.saldo;
    return acc;
  }, [rows]);
  const totalSaldo = useMemo(() => rows.reduce((s, r) => s + r.saldo, 0), [rows]);

  if (!can('compras', 'ver')) {
    return <ErrorState title="Sin acceso" message="No tienes permiso para ver cuentas por pagar." />;
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Reporte de cuentas por pagar</h2>
          <p className="panel-page-sub">Saldos pendientes por factura y antigüedad.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/compras/cxp">
          Volver
        </Link>
      </div>

      <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
        <div className="print-meta" style={{ margin: 0 }}>
          {BUCKETS.map((b) => (
            <div className="print-meta-row" key={b}>
              <dt>
                <Badge tone={bucketTone(b)}>{b} días</Badge>
              </dt>
              <dd>{MXN.format(byBucket[b] ?? 0)}</dd>
            </div>
          ))}
          <div className="print-meta-row">
            <dt><strong>Total por pagar</strong></dt>
            <dd><strong>{MXN.format(totalSaldo)}</strong></dd>
          </div>
        </div>
      </div>

      {cxp.loading ? (
        <Spinner label="Cargando cuentas por pagar…" />
      ) : cxp.error ? (
        <ErrorState message={cxp.error} onRetry={cxp.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="Sin saldos" message="No hay facturas con saldo pendiente." />
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Folio</th>
                <th className="panel-table-num">Total</th>
                <th className="panel-table-num">Saldo</th>
                <th className="panel-table-num">Días</th>
                <th>Antigüedad</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.invoiceId}>
                  <td>{r.supplierName ?? '—'}</td>
                  <td>
                    <Link href={`/panel/compras/cxp/${r.invoiceId}`}>{r.folio}</Link>
                  </td>
                  <td className="panel-table-num">{MXN.format(r.total)}</td>
                  <td className="panel-table-num">{MXN.format(r.saldo)}</td>
                  <td className="panel-table-num">{r.daysOverdue}</td>
                  <td>
                    <Badge tone={bucketTone(r.bucket)}>{r.bucket}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
