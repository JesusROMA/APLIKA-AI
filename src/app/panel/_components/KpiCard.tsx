'use client';

/** Tarjeta KPI para el dashboard. Formatea el número según la unidad. */

import type { DashboardKpi } from '@/lib/types/erp';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat('es-MX');

export function formatKpi(value: number, unit: DashboardKpi['unit']): string {
  switch (unit) {
    case 'mxn':
      return MXN.format(value);
    case 'pct':
      return `${NUM.format(value)}%`;
    case 'count':
    default:
      return NUM.format(value);
  }
}

export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  const trend = kpi.trend;
  return (
    <div className="kpi-card">
      <span className="kpi-label">{kpi.label}</span>
      <span className="kpi-value">{formatKpi(kpi.value, kpi.unit)}</span>
      {trend && (
        <span className={`kpi-trend kpi-trend--${trend.direction}`}>
          {trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '■'}{' '}
          {NUM.format(Math.abs(trend.pct))}%
        </span>
      )}
    </div>
  );
}
