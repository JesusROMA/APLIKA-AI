'use client';

/**
 * Dashboard del panel ERP. Consume GET /api/erp/dashboard (DashboardData) y
 * renderiza KPI cards según los módulos activos (el backend decide qué KPIs
 * manda). Secciones opcionales: tendencia de ventas, alertas de stock y citas
 * de hoy — sólo si vienen en la respuesta. Estados vacío / carga / error.
 */

import { useAsyncData } from './_lib/hooks';
import { getDashboard } from './_lib/api';
import { KpiCard } from './_components/KpiCard';
import { Badge, EmptyState, ErrorState, LoadingState } from './_components/States';
import { useSession } from './_components/session';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default function DashboardPage() {
  const session = useSession();
  const { data, loading, error, reload } = useAsyncData(getDashboard);

  if (loading) return <LoadingState label="Cargando indicadores…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Sin datos" message="El dashboard no devolvió información." />;

  const hasKpis = data.kpis && data.kpis.length > 0;
  const orgName = (session.impersonating ?? session.organization)?.name ?? 'tu organización';

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Resumen</h2>
          <p className="panel-page-sub">Indicadores de {orgName}.</p>
        </div>
      </div>

      {hasKpis ? (
        <div className="kpi-grid">
          {data.kpis.map((kpi) => (
            <KpiCard key={kpi.key} kpi={kpi} />
          ))}
        </div>
      ) : (
        <div className="panel-card" style={{ marginBottom: 'var(--sp-4)' }}>
          <EmptyState
            title="Sin indicadores"
            message="No hay módulos con KPIs activos para tu organización."
          />
        </div>
      )}

      {data.stockAlerts && data.stockAlerts.length > 0 && (
        <section className="panel-card" style={{ padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
          <h3 className="panel-page-title" style={{ fontSize: 'var(--fs-card-title)', marginBottom: 'var(--sp-2)' }}>
            Alertas de stock
          </h3>
          <div className="panel-table-wrap" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
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
        <section className="panel-card" style={{ padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' }}>
          <h3 className="panel-page-title" style={{ fontSize: 'var(--fs-card-title)', marginBottom: 'var(--sp-2)' }}>
            Citas de hoy
          </h3>
          <div className="panel-table-wrap" style={{ boxShadow: 'none', border: '1px solid var(--line)' }}>
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
                      {new Date(ap.startsAt).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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

      {data.salesTrend && data.salesTrend.length > 0 && (
        <section className="panel-card" style={{ padding: 'var(--sp-3)' }}>
          <h3 className="panel-page-title" style={{ fontSize: 'var(--fs-card-title)', marginBottom: 'var(--sp-2)' }}>
            Tendencia de ventas
          </h3>
          <SalesTrend data={data.salesTrend} />
        </section>
      )}
    </div>
  );
}

/** Mini gráfico de barras en CSS puro (sin librerías). */
function SalesTrend({ data }: { data: { date: string; total: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 'var(--sp-1)',
        height: 160,
        overflowX: 'auto',
      }}
      role="img"
      aria-label="Tendencia de ventas por fecha"
    >
      {data.map((d) => (
        <div
          key={d.date}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 32 }}
          title={`${d.date}: ${MXN.format(d.total)}`}
        >
          <div
            style={{
              width: 24,
              height: `${Math.round((d.total / max) * 120) + 4}px`,
              background: 'var(--blue)',
              borderRadius: 'var(--r-xs)',
            }}
          />
          <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-45)' }}>
            {d.date.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}
