'use client';

/**
 * Torre de control del super-admin (/admin). Resumen ejecutivo de la
 * plataforma con números reales: tenants, MRR, usuarios, GMV y actividad del
 * rango, salud, distribución por plan/vertical, altas por mes y bitácora de
 * errores (0027). Consume GET /api/admin/dashboard?days=; la gestión profunda
 * (tenants/planes/incidencias) sigue en el panel dc, ligado desde aquí.
 */

import { useEffect, useState } from 'react';
import {
  ChartCard,
  HBarList,
  MiniColumns,
  TrendChart,
  fmtMoney,
} from '../panel/_components/charts';
import { StatTile } from '../panel/_components/KpiCard';
import { EmptyState, ErrorState, LoadingState } from '../panel/_components/States';

const NUM = new Intl.NumberFormat('es-MX');
const RANGOS = [7, 30, 90] as const;
type Rango = (typeof RANGOS)[number];

interface AdminDashboard {
  range: { days: number; from: string; to: string };
  kpis: {
    tenants: { activos: number; total: number; nuevosMes: number };
    mrr: number;
    usuarios: { total: number; activos7d: number };
    gmv: { total: number; pedidos: number };
    errores24h: number;
    incidenciasAbiertas: number;
    conversacionesIa: number;
  };
  docsCount: { pedidos: number; cotizaciones: number; facturas: number };
  gmvTrend: { date: string; total: number; orders: number }[];
  topTenants: { name: string; slug: string; total: number; orders: number }[];
  tenantsPorVertical: { label: string; count: number }[];
  tenantsPorPlan: { label: string; count: number }[];
  altasPorMes: { month: string; count: number }[];
  salud: { label: string; value: string; ok: boolean }[];
  errores: { at: string; route: string; method: string; message: string; orgName: string | null }[];
}

async function fetchDashboard(days: Rango): Promise<AdminDashboard> {
  const res = await fetch(`/api/admin/dashboard?days=${days}`, { credentials: 'same-origin' });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Error ${res.status}`);
  return body as AdminDashboard;
}

export default function AdminDashboardPage() {
  const [days, setDays] = useState<Rango>(30);
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchDashboard(days)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Error desconocido'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days, reloadKey]);

  const logout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      const body = (await res.json().catch(() => null)) as { redirect?: string } | null;
      window.location.href = body?.redirect ?? '/dc/Login.dc.html';
    } catch {
      window.location.href = '/dc/Login.dc.html';
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-topbar">
        <div className="admin-brand">
          <span className="admin-brand-logo" aria-hidden="true">
            <span /><span /><span /><span />
          </span>
          <span className="admin-brand-name">
            Aplika<span style={{ color: 'var(--blue-logo)' }}>.ai</span>
          </span>
          <span className="admin-brand-sep">·</span>
          <span className="admin-brand-title">Torre de control</span>
        </div>
        <nav className="admin-topbar-nav">
          <a className="chart-viewbtn" href="/dc/Panel Super-admin.dc.html">
            Gestión de tenants
          </a>
          <a className="chart-viewbtn" href="/panel">
            Panel ERP
          </a>
          <button type="button" className="chart-viewbtn admin-logout" onClick={logout}>
            Salir
          </button>
        </nav>
      </header>

      <main className="admin-main">
        <div className="panel-page-head">
          <div>
            <h1 className="panel-page-title">Resumen de la plataforma</h1>
            <p className="panel-page-sub">
              {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
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

        {!data && loading && <LoadingState label="Cargando la torre de control…" />}
        {!data && error && (
          <ErrorState
            message={`${error}. Inicia sesión como super-admin.`}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        )}

        {data && (
          <div className={loading ? 'dash-refetching' : undefined}>
            {/* ===== KPIs ===== */}
            <div className="kpi-grid">
              <StatTile
                label="Tenants activos"
                value={NUM.format(data.kpis.tenants.activos)}
                sub={`${NUM.format(data.kpis.tenants.total)} en total · ${NUM.format(data.kpis.tenants.nuevosMes)} nuevos este mes`}
              />
              <StatTile label="MRR" value={fmtMoney(data.kpis.mrr)} sub="suscripciones activas" />
              <StatTile
                label="Usuarios"
                value={NUM.format(data.kpis.usuarios.total)}
                sub={`${NUM.format(data.kpis.usuarios.activos7d)} activos últimos 7 días`}
              />
              <StatTile
                label={`Ventas de tenants (${data.range.days}d)`}
                value={fmtMoney(data.kpis.gmv.total)}
                sub={`${NUM.format(data.kpis.gmv.pedidos)} pedidos en la plataforma`}
                spark={data.gmvTrend.slice(-12).map((d) => d.total)}
              />
              <StatTile
                label="Errores de app (24h)"
                value={NUM.format(data.kpis.errores24h)}
                sub={data.kpis.errores24h === 0 ? 'API sana' : 'revisa la bitácora de abajo'}
              />
              <StatTile
                label="Incidencias abiertas"
                value={NUM.format(data.kpis.incidenciasAbiertas)}
                sub="se gestionan en el panel de tenants"
              />
            </div>

            {/* ===== Salud ===== */}
            <div className="admin-health">
              {data.salud.map((h) => (
                <span key={h.label} className={`admin-health-chip${h.ok ? '' : ' is-bad'}`}>
                  <span className="admin-health-dot" aria-hidden="true" />
                  {h.label}: {h.value}
                </span>
              ))}
            </div>

            {/* ===== GMV diario ===== */}
            <div style={{ marginBottom: 'var(--sp-3)' }}>
              <ChartCard
                title="Ventas de los tenants por día"
                sub={`Últimos ${data.range.days} días · ${fmtMoney(data.kpis.gmv.total)} · actividad: ${NUM.format(
                  data.docsCount.pedidos,
                )} pedidos, ${NUM.format(data.docsCount.cotizaciones)} cotizaciones, ${NUM.format(
                  data.docsCount.facturas,
                )} facturas`}
                table={{
                  head: ['Fecha', 'Ventas', 'Pedidos'],
                  rows: data.gmvTrend.map((d) => [d.date, fmtMoney(d.total), d.orders]),
                }}
              >
                <TrendChart data={data.gmvTrend} />
              </ChartCard>
            </div>

            {/* ===== Top tenants + altas ===== */}
            <div className="dash-grid2">
              <ChartCard
                title="Top tenants por ventas"
                sub={`Últimos ${data.range.days} días`}
                table={{
                  head: ['Tenant', 'Ventas', 'Pedidos'],
                  rows: data.topTenants.map((t) => [t.name, fmtMoney(t.total), t.orders]),
                }}
              >
                {data.topTenants.length ? (
                  <HBarList
                    items={data.topTenants.map((t) => ({
                      label: t.name,
                      sub: t.slug,
                      value: t.total,
                      hint: `${NUM.format(t.orders)} pedidos`,
                    }))}
                    format={fmtMoney}
                  />
                ) : (
                  <EmptyState title="Sin ventas" message="Ningún tenant registró ventas en el rango." />
                )}
              </ChartCard>

              <ChartCard
                title="Altas de tenants por mes"
                sub="Últimos 6 meses"
                table={{
                  head: ['Mes', 'Altas'],
                  rows: data.altasPorMes.map((m) => [m.month, m.count]),
                }}
              >
                <MiniColumns data={data.altasPorMes.map((m) => ({ label: m.month, value: m.count }))} />
              </ChartCard>
            </div>

            {/* ===== Distribuciones ===== */}
            <div className="dash-grid2">
              <ChartCard
                title="Tenants por vertical"
                sub={`${NUM.format(data.kpis.tenants.total)} organizaciones`}
                table={{
                  head: ['Vertical', 'Tenants'],
                  rows: data.tenantsPorVertical.map((v) => [v.label, v.count]),
                }}
              >
                <HBarList items={data.tenantsPorVertical.map((v) => ({ label: v.label, value: v.count }))} />
              </ChartCard>
              <ChartCard
                title="Tenants por plan"
                sub="Distribución comercial"
                table={{
                  head: ['Plan', 'Tenants'],
                  rows: data.tenantsPorPlan.map((v) => [v.label, v.count]),
                }}
              >
                <HBarList items={data.tenantsPorPlan.map((v) => ({ label: v.label, value: v.count }))} />
              </ChartCard>
            </div>

            {/* ===== Bitácora de errores ===== */}
            <section className="panel-card chart-card">
              <div className="chart-card-head">
                <div>
                  <h3 className="chart-card-title">Errores recientes de la aplicación</h3>
                  <p className="chart-card-sub">
                    Errores 5xx de la API — cada uno se registra automáticamente con su ruta y tenant.
                  </p>
                </div>
              </div>
              {data.errores.length === 0 ? (
                <p className="dash-allclear">✓ Sin errores registrados. La API está sana.</p>
              ) : (
                <div className="panel-table-wrap chart-table" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
                  <table className="panel-table">
                    <thead>
                      <tr>
                        <th>Cuándo</th>
                        <th>Ruta</th>
                        <th>Tenant</th>
                        <th>Mensaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.errores.map((e, i) => (
                        <tr key={i}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {new Date(e.at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <code className="admin-err-route">{e.method} {e.route}</code>
                          </td>
                          <td>{e.orgName ?? '—'}</td>
                          <td className="admin-err-msg">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
