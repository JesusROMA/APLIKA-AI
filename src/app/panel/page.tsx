'use client';

/**
 * Dashboard del panel ERP. Consume GET /api/erp/dashboard?days= (DashboardData)
 * y arma el resumen ejecutivo: tiles de hoy/mes/cartera/inventario con deltas,
 * tendencia de ventas, flujo de efectivo, top productos, antigüedad de CxC y
 * la lista de documentos que requieren acción. El filtro de rango (7/30/90
 * días) alcanza a la tendencia, el flujo y el top; hoy/mes son fijos por
 * definición. En el refetch se conserva el render anterior atenuado (sin
 * saltos de layout).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DashboardData } from '@/lib/types/erp';
import { getDashboard } from './_lib/api';
import { StatTile } from './_components/KpiCard';
import { Badge, EmptyState, ErrorState, LoadingState } from './_components/States';
import { useSession } from './_components/session';
import {
  AgingChart,
  CashflowChart,
  ChartCard,
  TopProductsBars,
  TrendChart,
  fmtDay,
  fmtMoney,
  SERIES_1,
  SERIES_2,
} from './_components/charts';

const NUM = new Intl.NumberFormat('es-MX');
const RANGOS = [7, 30, 90] as const;
type Rango = (typeof RANGOS)[number];

const plural = (n: number, uno: string, varios: string) => `${NUM.format(n)} ${n === 1 ? uno : varios}`;
/** La tarjeta ocupa las 2 columnas cuando su hermana de fila no se renderiza. */
const span2 = (alone: boolean) => (alone ? { gridColumn: '1 / -1' } : undefined);

export default function DashboardPage() {
  const session = useSession();
  const [days, setDays] = useState<Rango>(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getDashboard(days)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Error desconocido'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days, reloadKey]);

  if (!data && loading) return <LoadingState label="Cargando indicadores…" />;
  if (!data && error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return <EmptyState title="Sin datos" message="El dashboard no devolvió información." />;

  const orgName = (session.impersonating ?? session.organization)?.name ?? 'tu organización';
  const hoyStr = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const trend = data.salesTrend ?? [];
  const spark = trend.slice(-12).map((d) => d.total);
  const rangoStr = `Últimos ${data.range.days} días`;

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Resumen</h2>
          <p className="panel-page-sub">
            {orgName} · {hoyStr}
          </p>
        </div>
        <div className="dash-range" role="group" aria-label="Rango del periodo">
          {RANGOS.map((r) => (
            <button
              key={r}
              type="button"
              className={`dash-range-btn${days === r ? ' is-active' : ''}`}
              onClick={() => setDays(r)}
            >
              {r} días
            </button>
          ))}
        </div>
      </div>

      <div className={loading ? 'dash-refetching' : undefined}>
        {/* ===== Tiles: el pulso de hoy y del mes ===== */}
        <div className="kpi-grid">
          {data.hoy && (
            <StatTile
              label="Ventas de hoy"
              value={fmtMoney(data.hoy.ventas)}
              sub={plural(data.hoy.pedidos, 'pedido', 'pedidos')}
              delta={data.hoy.delta}
              spark={spark}
            />
          )}
          {data.mes && (
            <StatTile
              label="Ventas del mes"
              value={fmtMoney(data.mes.ventas)}
              sub={`${plural(data.mes.pedidos, 'pedido', 'pedidos')} · ticket ${fmtMoney(data.mes.ticketPromedio)}`}
              delta={data.mes.delta}
            />
          )}
          {data.mes && data.mes.margenPct !== null && (
            <StatTile
              label="Margen bruto del mes"
              value={`${NUM.format(data.mes.margenPct)}%`}
              sub={data.mes.margenMonto !== null ? `${fmtMoney(data.mes.margenMonto)} (según costo en kardex)` : undefined}
            />
          )}
          {data.cxc && (
            <StatTile
              label="Por cobrar"
              value={fmtMoney(data.cxc.total)}
              sub={`${plural(data.cxc.facturas, 'factura', 'facturas')} · ${fmtMoney(data.cxc.vencido31)} con +30 días`}
            />
          )}
          {data.cxp && (
            <StatTile
              label="Por pagar"
              value={fmtMoney(data.cxp.total)}
              sub={`${plural(data.cxp.facturas, 'factura', 'facturas')} · ${fmtMoney(data.cxp.vencido31)} con +30 días`}
            />
          )}
          {data.inventario && (
            <StatTile
              label="Inventario"
              value={fmtMoney(data.inventario.valor)}
              sub={`${NUM.format(data.inventario.skus)} SKUs con stock · ${NUM.format(data.inventario.stockBajo)} bajo mínimo`}
            />
          )}
        </div>

        {/* ===== Tendencia de ventas (rango) ===== */}
        {trend.length > 0 && (
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <ChartCard
              title="Ventas por día"
              sub={`${rangoStr} · ${fmtMoney(trend.reduce((a, d) => a + d.total, 0))} en ${plural(
                trend.reduce((a, d) => a + d.orders, 0),
                'pedido',
                'pedidos',
              )}`}
              table={{
                head: ['Fecha', 'Ventas', 'Pedidos'],
                rows: trend.map((d) => [fmtDay(d.date), fmtMoney(d.total), d.orders]),
              }}
            >
              <TrendChart data={trend} />
            </ChartCard>
          </div>
        )}

        {/* ===== Flujo de efectivo + Top productos ===== */}
        {(data.flujo || (data.topProducts && data.topProducts.length > 0)) && (
          <div className="dash-grid2">
            {data.flujo && (
              <ChartCard
                style={span2(!data.topProducts || data.topProducts.length === 0)}
                title="Flujo de efectivo"
                sub={`${rangoStr} · neto ${fmtMoney(data.flujo.neto)} (${fmtMoney(data.flujo.cobros)} cobrado, ${fmtMoney(
                  data.flujo.pagos,
                )} pagado)`}
                legend={[
                  { label: 'Cobros', color: SERIES_1 },
                  { label: 'Pagos', color: SERIES_2 },
                ]}
                table={{
                  head: [data.flujo.bucket === 'dia' ? 'Día' : 'Semana del', 'Cobros', 'Pagos'],
                  rows: data.flujo.series.map((s) => [fmtDay(s.label), fmtMoney(s.cobros), fmtMoney(s.pagos)]),
                }}
              >
                <CashflowChart series={data.flujo.series} />
              </ChartCard>
            )}
            {data.topProducts && data.topProducts.length > 0 && (
              <ChartCard
                style={span2(!data.flujo)}
                title="Top productos"
                sub={`${rangoStr} · por importe vendido`}
                table={{
                  head: ['Producto', 'Importe', 'Pzas'],
                  rows: data.topProducts.map((p) => [`${p.sku} — ${p.name}`, fmtMoney(p.amount), NUM.format(p.qty)]),
                }}
              >
                <TopProductsBars items={data.topProducts} />
              </ChartCard>
            )}
          </div>
        )}

        {/* ===== Cartera + Requiere tu atención ===== */}
        <div className="dash-grid2">
          {data.cxc && (
            <ChartCard
              style={span2(!data.pendientes)}
              title="Antigüedad de cartera (CxC)"
              sub={`${fmtMoney(data.cxc.total)} abiertos en ${NUM.format(data.cxc.facturas)} factura${
                data.cxc.facturas === 1 ? '' : 's'
              }`}
              table={{
                head: ['Antigüedad', 'Saldo', 'Facturas'],
                rows: data.cxc.aging.map((b) => [`${b.bucket} días`, fmtMoney(b.monto), b.facturas]),
              }}
            >
              {data.cxc.facturas > 0 ? (
                <AgingChart aging={data.cxc.aging} />
              ) : (
                <p className="dash-allclear">Sin saldo por cobrar. Cartera al corriente.</p>
              )}
            </ChartCard>
          )}

          {data.pendientes && (
            <section className="panel-card chart-card" style={span2(!data.cxc)}>
              <div className="chart-card-head">
                <div>
                  <h3 className="chart-card-title">Requiere tu atención</h3>
                  <p className="chart-card-sub">Documentos abiertos hoy</p>
                </div>
              </div>
              {data.pendientes.some((p) => p.count > 0) ? (
                <div className="dash-list">
                  {data.pendientes
                    .filter((p) => p.count > 0)
                    .map((p) => (
                      <Link key={p.key} href={p.href} className="dash-list-row">
                        <span className="dash-list-count">{NUM.format(p.count)}</span>
                        <span className="dash-list-label">{p.label}</span>
                        {p.amount !== null && p.amount > 0 && (
                          <span className="dash-list-amount">{fmtMoney(p.amount)}</span>
                        )}
                        <span className="dash-list-go" aria-hidden="true">
                          →
                        </span>
                      </Link>
                    ))}
                </div>
              ) : (
                <p className="dash-allclear">✓ Todo en orden. No hay documentos esperando acción.</p>
              )}
            </section>
          )}
        </div>

        {/* ===== Stock bajo + Citas ===== */}
        {((data.stockAlerts && data.stockAlerts.length > 0) ||
          (data.todayAppointments && data.todayAppointments.length > 0)) && (
          <div className="dash-grid2">
            {data.stockAlerts && data.stockAlerts.length > 0 && (
              <section
                className="panel-card chart-card"
                style={span2(!data.todayAppointments || data.todayAppointments.length === 0)}
              >
                <div className="chart-card-head">
                  <div>
                    <h3 className="chart-card-title">Stock bajo mínimo</h3>
                    <p className="chart-card-sub">
                      {data.inventario ? `${NUM.format(data.inventario.stockBajo)} variantes por resurtir` : undefined}
                    </p>
                  </div>
                  <Link href="/panel/inventario" className="chart-viewbtn">
                    Ver inventario
                  </Link>
                </div>
                <div className="panel-table-wrap chart-table" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
                  <table className="panel-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Producto</th>
                        <th className="panel-table-num">Stock</th>
                        <th className="panel-table-num">Mínimo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stockAlerts.map((a) => (
                        <tr key={a.sku}>
                          <td>{a.sku}</td>
                          <td>{a.name}</td>
                          <td className="panel-table-num">
                            <Badge tone={a.stock <= a.minStock ? 'ro' : 'off'}>{a.stock}</Badge>
                          </td>
                          <td className="panel-table-num">{a.minStock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {data.todayAppointments && data.todayAppointments.length > 0 && (
              <section
                className="panel-card chart-card"
                style={span2(!data.stockAlerts || data.stockAlerts.length === 0)}
              >
                <div className="chart-card-head">
                  <div>
                    <h3 className="chart-card-title">Citas de hoy</h3>
                    <p className="chart-card-sub">{NUM.format(data.todayAppointments.length)} programadas</p>
                  </div>
                  <Link href="/panel/agenda" className="chart-viewbtn">
                    Ver agenda
                  </Link>
                </div>
                <div className="panel-table-wrap chart-table" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
                  <table className="panel-table">
                    <thead>
                      <tr>
                        <th>Hora</th>
                        <th>Cliente</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.todayAppointments.map((ap) => (
                        <tr key={ap.id}>
                          <td>
                            {new Date(ap.startsAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>{ap.patientName}</td>
                          <td>
                            <Badge tone="blue">{ap.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
