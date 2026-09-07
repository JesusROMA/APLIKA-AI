'use client';

/**
 * Stat tile del dashboard: etiqueta + valor + sub-línea + delta contra un
 * periodo nombrado (color según si subir es bueno) + sparkline opcional.
 */

import type { StatDelta } from '@/lib/types/erp';
import { Sparkline } from './charts';

const NUM = new Intl.NumberFormat('es-MX');

export function StatTile({
  label,
  value,
  sub,
  delta,
  goodWhen = 'up',
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: StatDelta;
  /** Para costos/cartera "subir" es malo: invierte el color del delta. */
  goodWhen?: 'up' | 'down';
  spark?: number[];
}) {
  const tone =
    !delta || delta.direction === 'flat' || delta.pct === null
      ? 'flat'
      : delta.direction === goodWhen
        ? 'up'
        : 'down';
  return (
    <div className="kpi-card">
      <span className="kpi-label">{label}</span>
      <div className="kpi-value-row">
        <span className="kpi-value">{value}</span>
        {spark && spark.length > 1 && <Sparkline points={spark} />}
      </div>
      {sub && <span className="kpi-sub">{sub}</span>}
      {/* Sin base de comparación (÷0) el % no existe: se omite el chip. */}
      {delta && delta.pct !== null && (
        <span className={`kpi-trend kpi-trend--${tone}`} title={`vs ${delta.vs}`}>
          {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '■'}{' '}
          {NUM.format(Math.abs(delta.pct))}%<span className="kpi-trend-vs">vs {delta.vs}</span>
        </span>
      )}
    </div>
  );
}
