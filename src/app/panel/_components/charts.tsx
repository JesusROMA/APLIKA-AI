'use client';

/**
 * Primitivas de gráficas del dashboard (SVG inline, sin librerías).
 * Reglas visuales: líneas 2px, barras ≤24px con punta redondeada 4px y base
 * cuadrada, separación de 2px en color de superficie entre marcas contiguas,
 * grid hairline sólido y recesivo, texto siempre en tintas (nunca en el color
 * de la serie). Los tooltips complementan pero no son la única vía: cada
 * gráfica ofrece vista de tabla (toggle en ChartCard).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

// Paleta de series (validada contra superficie blanca):
// azul de marca (serie 1) + naranja (serie 2, par CVD-seguro) y rampa ordinal
// azul claro→oscuro para categorías ordenadas (antigüedad de cartera).
export const SERIES_1 = '#378ADD';
export const SERIES_1_WASH = 'rgba(55, 138, 221, 0.10)';
export const SERIES_2 = '#EB6834';
export const ORDINAL_BLUE = ['#86B6EF', '#378ADD', '#1C5CAB', '#0D366B'];
const SPARK = '#B5D4F4'; // trazo de sparkline (de-énfasis)

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat('es-MX');

/** $1.2M para valores grandes; MXN completo por debajo. */
export function fmtMoney(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}M`;
  return MXN.format(v);
}

/** Ticks de eje: número plano con comas (sin símbolo, para no saturar). */
function fmtTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 1000)}k`;
  return NUM.format(v);
}

/** "2026-09-07" → "7 sep". */
export function fmtDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '');
}

/** Ticks "bonitos": 0..techo en pasos 1/2/5×10ⁿ (3-4 divisiones). */
function niceTicks(max: number): number[] {
  const target = Math.max(max, 1) / 3;
  const pow = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= target) ?? pow * 10;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return ticks;
}

/** Ancho real del contenedor (para SVG responsivo sin distorsión de texto). */
function useMeasure<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width ?? 0;
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ===== Tooltip compartido =====

interface TipRow {
  /** Color de la llave de serie (trazo corto); omitir para filas neutras. */
  color?: string;
  label: string;
  value: string;
}
interface TipState {
  x: number;
  y: number;
  title: string;
  rows: TipRow[];
}

function ChartTip({ tip, width }: { tip: TipState; width: number }) {
  const flip = tip.x > width * 0.6;
  return (
    <div
      className="chart-tip"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
      }}
    >
      <div className="chart-tip-title">{tip.title}</div>
      {tip.rows.map((r, i) => (
        <div key={i} className="chart-tip-row">
          {r.color && <span className="chart-tip-key" style={{ background: r.color }} />}
          <span className="chart-tip-value">{r.value}</span>
          <span className="chart-tip-label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// ===== Tarjeta contenedora con leyenda y vista de tabla =====

export interface ChartTable {
  head: string[];
  rows: (string | number)[][];
}

export function ChartCard({
  title,
  sub,
  legend,
  table,
  style,
  children,
}: {
  title: string;
  sub?: string;
  legend?: { label: string; color: string }[];
  table: ChartTable;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className="panel-card chart-card" style={style}>
      <div className="chart-card-head">
        <div>
          <h3 className="chart-card-title">{title}</h3>
          {sub && <p className="chart-card-sub">{sub}</p>}
        </div>
        <div className="chart-card-tools">
          {legend && view === 'chart' && (
            <div className="chart-legend" aria-hidden="true">
              {legend.map((l) => (
                <span key={l.label} className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            className="chart-viewbtn"
            onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
          >
            {view === 'chart' ? 'Tabla' : 'Gráfica'}
          </button>
        </div>
      </div>
      {view === 'chart' ? (
        children
      ) : (
        <div className="panel-table-wrap chart-table" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
          <table className="panel-table">
            <thead>
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} className={i > 0 ? 'panel-table-num' : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={j > 0 ? 'panel-table-num' : undefined}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ===== Sparkline (para stat tiles) =====

export function Sparkline({ points }: { points: number[] }) {
  const W = 96;
  const H = 28;
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const step = W / (points.length - 1);
  const xy = points.map((v, i) => [i * step, 3 + (H - 6) * (1 - v / max)] as const);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg width={W} height={H} className="kpi-spark" aria-hidden="true">
      <path d={d} fill="none" stroke={SPARK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3.5} fill={SERIES_1} stroke="var(--white)" strokeWidth={2} />
    </svg>
  );
}

// ===== Tendencia de ventas (línea + wash de área + crosshair) =====

export function TrendChart({ data }: { data: { date: string; total: number; orders: number }[] }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = width || 640;
  const H = 250;
  const pad = { l: 52, r: 20, t: 16, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = data.length;
  const ticks = niceTicks(Math.max(...data.map((d) => d.total), 1));
  const top = ticks[ticks.length - 1];
  const x = (i: number) => pad.l + (n > 1 ? (i * iw) / (n - 1) : iw / 2);
  const y = (v: number) => pad.t + ih * (1 - v / top);

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;

  // ~5 etiquetas de eje X repartidas.
  const labelEvery = Math.max(1, Math.round(n / 5));
  const xLabels = data.map((d, i) => ({ i, show: i % labelEvery === 0 || i === n - 1 }));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = Math.round(((px / rect.width) * (n - 1)));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  const last = data[n - 1];
  const tip: TipState | null =
    hover !== null
      ? {
          x: x(hover),
          y: y(data[hover].total),
          title: fmtDay(data[hover].date),
          rows: [
            { color: SERIES_1, label: 'ventas', value: fmtMoney(data[hover].total) },
            { label: data[hover].orders === 1 ? 'pedido' : 'pedidos', value: NUM.format(data[hover].orders) },
          ],
        }
      : null;

  return (
    <div ref={ref} className="chart-plot" role="img" aria-label="Ventas por día del periodo">
      <svg width={W} height={H} style={{ display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="chart-axis-text">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        <path d={area} fill={SERIES_1_WASH} />
        <path d={line} fill="none" stroke={SERIES_1} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {xLabels.filter((l) => l.show).map(({ i }) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="chart-axis-text">
            {fmtDay(data[i].date)}
          </text>
        ))}
        {/* Último punto: marcador con anillo de superficie + etiqueta directa. */}
        {n > 0 && (
          <g>
            <circle cx={x(n - 1)} cy={y(last.total)} r={4.5} fill={SERIES_1} stroke="var(--white)" strokeWidth={2} />
            <text
              x={Math.min(x(n - 1), W - pad.r)}
              y={Math.max(y(last.total) - 12, 12)}
              textAnchor="end"
              className="chart-direct-label"
            >
              {fmtMoney(last.total)}
            </text>
          </g>
        )}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--border)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(data[hover].total)} r={5} fill={SERIES_1} stroke="var(--white)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={pad.l}
          y={pad.t}
          width={iw}
          height={ih}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {tip && <ChartTip tip={tip} width={W} />}
    </div>
  );
}

// ===== Flujo de efectivo (barras agrupadas: cobros vs pagos) =====

/** Rect con esquinas superiores redondeadas (punta de dato) y base cuadrada. */
function topRoundedRect(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

export function CashflowChart({
  series,
}: {
  series: { label: string; cobros: number; pagos: number }[];
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const W = width || 640;
  const H = 230;
  const pad = { l: 52, r: 16, t: 16, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const n = series.length;
  const maxV = Math.max(...series.flatMap((s) => [s.cobros, s.pagos]), 1);
  const ticks = niceTicks(maxV);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => pad.t + ih * (1 - v / top);
  const slot = iw / Math.max(n, 1);
  const barW = Math.max(4, Math.min(24, (slot - 10) / 2 - 1)); // 2px de gap entre el par
  const labelEvery = Math.max(1, Math.round(n / 6));

  const tip: TipState | null =
    hover !== null
      ? {
          x: pad.l + slot * hover + slot / 2,
          y: y(Math.max(series[hover].cobros, series[hover].pagos)),
          title: fmtDay(series[hover].label),
          rows: [
            { color: SERIES_1, label: 'cobros', value: fmtMoney(series[hover].cobros) },
            { color: SERIES_2, label: 'pagos', value: fmtMoney(series[hover].pagos) },
          ],
        }
      : null;

  return (
    <div ref={ref} className="chart-plot" role="img" aria-label="Cobros y pagos por periodo">
      <svg width={W} height={H} style={{ display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="chart-axis-text">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const x1 = cx - barW - 1; // 2px de superficie entre las dos barras
          const x2 = cx + 1;
          return (
            <g key={s.label} opacity={hover === null || hover === i ? 1 : 0.55}>
              {s.cobros > 0 && <path d={topRoundedRect(x1, y(s.cobros), barW, pad.t + ih - y(s.cobros))} fill={SERIES_1} />}
              {s.pagos > 0 && <path d={topRoundedRect(x2, y(s.pagos), barW, pad.t + ih - y(s.pagos))} fill={SERIES_2} />}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--border)" strokeWidth={1} />
        {series.map((s, i) =>
          i % labelEvery === 0 ? (
            <text key={s.label} x={pad.l + slot * i + slot / 2} y={H - 8} textAnchor="middle" className="chart-axis-text">
              {fmtDay(s.label)}
            </text>
          ) : null,
        )}
        {series.map((s, i) => (
          <rect
            key={`hit-${s.label}`}
            x={pad.l + slot * i}
            y={pad.t}
            width={slot}
            height={ih}
            fill="transparent"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {tip && <ChartTip tip={tip} width={W} />}
    </div>
  );
}

// ===== Top productos (barras horizontales, valor en la punta) =====

export function TopProductsBars({
  items,
}: {
  items: { sku: string; name: string; qty: number; amount: number }[];
}) {
  const max = Math.max(...items.map((i) => i.amount), 1);
  return (
    <div className="hbar-list" role="img" aria-label="Productos más vendidos del periodo">
      {items.map((p) => (
        <div key={p.sku + p.name} className="hbar-row" title={`${NUM.format(p.qty)} pzas`}>
          <div className="hbar-label">
            <span className="hbar-name">{p.name}</span>
            <span className="hbar-sku">{p.sku}</span>
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${Math.max(2, (p.amount / max) * 100)}%` }} />
            <span className="hbar-value">{fmtMoney(p.amount)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===== Antigüedad de cartera (rampa ordinal, valor en el tope) =====

export function AgingChart({
  aging,
}: {
  aging: { bucket: string; monto: number; facturas: number }[];
}) {
  const max = Math.max(...aging.map((b) => b.monto), 1);
  return (
    <div className="aging-chart" role="img" aria-label="Antigüedad del saldo por cobrar">
      {aging.map((b, i) => (
        <div key={b.bucket} className="aging-col" title={`${b.facturas} factura${b.facturas === 1 ? '' : 's'}`}>
          <span className="aging-value">{b.monto > 0 ? fmtMoney(b.monto) : '—'}</span>
          <div className="aging-track">
            <div
              className="aging-fill"
              style={{ height: `${Math.max(b.monto > 0 ? 4 : 0, (b.monto / max) * 100)}%`, background: ORDINAL_BLUE[i] }}
            />
          </div>
          <span className="aging-bucket">{b.bucket} días</span>
        </div>
      ))}
    </div>
  );
}
