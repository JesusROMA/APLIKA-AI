'use client';

/**
 * Cuentas por cobrar: facturas con saldo > 0, con antigüedad del saldo por
 * bucket y totales por tramo. Solo lectura (facturacion/ver).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import type { CxcRow } from '@/lib/types/erp-ventas';
import { getCxc } from '../../_lib/facturacion';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { Badge, Spinner, ErrorState, EmptyState } from '../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const BUCKETS: CxcRow['bucket'][] = ['0-30', '31-60', '61-90', '90+'];

function bucketTone(b: CxcRow['bucket']): 'on' | 'off' | 'blue' | 'ro' {
  if (b === '0-30') return 'on';
  if (b === '90+') return 'ro';
  return 'blue';
}

export default function CxcPage() {
  const can = useCan();
  const cxc = useAsyncData(getCxc);

  const rows = useMemo(() => cxc.data ?? [], [cxc.data]);
  const byBucket = useMemo(() => {
    const acc: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const r of rows) acc[r.bucket] += r.saldo;
    return acc;
  }, [rows]);
  const totalSaldo = useMemo(() => rows.reduce((s, r) => s + r.saldo, 0), [rows]);

  if (!can('facturacion', 'ver')) {
    return <ErrorState title="Sin acceso" message="No tienes permiso para ver cuentas por cobrar." />;
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Cuentas por cobrar</h2>
          <p className="panel-page-sub">Saldos pendientes por factura y antigüedad.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/facturacion">
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
            <dt><strong>Total por cobrar</strong></dt>
            <dd><strong>{MXN.format(totalSaldo)}</strong></dd>
          </div>
        </div>
      </div>

      {cxc.loading ? (
        <Spinner label="Cargando cuentas por cobrar…" />
      ) : cxc.error ? (
        <ErrorState message={cxc.error} onRetry={cxc.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="Sin saldos" message="No hay facturas con saldo pendiente." />
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Cliente</th>
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
                  <td>{r.customerName ?? 'Público en general'}</td>
                  <td>
                    <Link href={`/panel/facturacion/${r.invoiceId}`}>{r.folio}</Link>
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
