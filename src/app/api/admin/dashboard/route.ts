import { handle, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;
const RANGES = new Set([7, 30, 90]);

function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * GET /api/admin/dashboard?days=7|30|90 — torre de control con números reales
 * de TODA la plataforma: tenants, MRR, usuarios, GMV y actividad del rango,
 * salud, errores de la app (0027) y distribución por plan/vertical.
 */
export const GET = handle(async (req) => {
  await requireSuperAdmin();
  // any: varias tablas (0025/0027) fuera de los tipos generados
  // eslint-disable-next-line
  const admin = createSupabaseAdminClient() as any;

  const daysParam = Number(new URL(req.url).searchParams.get('days'));
  const days = RANGES.has(daysParam) ? daysParam : 30;
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const rangeStart = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const sixMonthsAgo = new Date(todayStart.getFullYear(), todayStart.getMonth() - 5, 1);
  const last24h = new Date(Date.now() - DAY_MS);
  const last7d = new Date(Date.now() - 7 * DAY_MS);

  const [
    { data: orgs },
    { data: subs },
    { count: profilesCount },
    { data: orders },
    { data: quotes },
    { data: invoices },
    { count: errores24h },
    { data: erroresRecientes },
    { data: incidents },
    { count: iaConvs },
    authList,
  ] = await Promise.all([
    admin.from('organizations').select('id, name, slug, status, created_at, vertical_id, verticals ( key ), plan_id, plans ( name )'),
    admin.from('subscriptions').select('status, plans ( price_mxn )'),
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin
      .from('orders')
      .select('organization_id, total, created_at')
      .gte('created_at', rangeStart.toISOString())
      .neq('status', 'cancelada')
      .limit(10000),
    admin.from('quotes').select('created_at').gte('created_at', rangeStart.toISOString()).limit(10000),
    admin.from('invoices').select('created_at').gte('created_at', rangeStart.toISOString()).limit(10000),
    admin.from('app_errors').select('id', { count: 'exact', head: true }).gte('created_at', last24h.toISOString()),
    admin
      .from('app_errors')
      .select('created_at, route, method, message, organization_id')
      .order('created_at', { ascending: false })
      .limit(12),
    admin.from('incidents').select('severity').neq('severity', 'ok'),
    admin
      .from('ai_conversations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', rangeStart.toISOString()),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const orgRows = orgs ?? [];
  const orgById = new Map(orgRows.map((o: { id: string; name: string; slug: string }) => [o.id, o]));

  // --- KPIs ---
  const activos = orgRows.filter((o: { status: string }) => o.status === 'activo').length;
  const nuevosMes = orgRows.filter(
    (o: { created_at: string }) => new Date(o.created_at) >= monthStart,
  ).length;
  const mrr = (subs ?? [])
    .filter((s: { status: string }) => s.status === 'activa')
    .reduce((a: number, s: { plans: { price_mxn: number } | null }) => a + Number(s.plans?.price_mxn ?? 0), 0);
  const usuariosActivos7d = (authList?.data?.users ?? []).filter(
    (u: { last_sign_in_at?: string | null }) => u.last_sign_in_at && new Date(u.last_sign_in_at) >= last7d,
  ).length;

  const orderRows = (orders ?? []) as { organization_id: string; total: number; created_at: string }[];
  const gmv = orderRows.reduce((a, o) => a + Number(o.total), 0);

  // --- Series diarias del rango ---
  const gmvTrend = Array.from({ length: days }, (_, i) => ({
    date: localYmd(new Date(rangeStart.getTime() + i * DAY_MS)),
    total: 0,
    orders: 0,
  }));
  const idxOf = (iso: string) => Math.floor((new Date(iso).getTime() - rangeStart.getTime()) / DAY_MS);
  for (const o of orderRows) {
    const i = idxOf(o.created_at);
    if (i >= 0 && i < days) {
      gmvTrend[i].total += Number(o.total);
      gmvTrend[i].orders += 1;
    }
  }
  for (const p of gmvTrend) p.total = Math.round(p.total);

  const docsCount = {
    pedidos: orderRows.length,
    cotizaciones: (quotes ?? []).length,
    facturas: (invoices ?? []).length,
  };

  // --- Top tenants por ventas del rango ---
  const byOrg = new Map<string, { total: number; orders: number }>();
  for (const o of orderRows) {
    const acc = byOrg.get(o.organization_id) ?? { total: 0, orders: 0 };
    acc.total += Number(o.total);
    acc.orders += 1;
    byOrg.set(o.organization_id, acc);
  }
  const topTenants = [...byOrg.entries()]
    .map(([id, v]) => ({
      name: (orgById.get(id) as { name?: string } | undefined)?.name ?? '—',
      slug: (orgById.get(id) as { slug?: string } | undefined)?.slug ?? '',
      total: Math.round(v.total),
      orders: v.orders,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  // --- Distribuciones ---
  const countBy = (fn: (o: unknown) => string) => {
    const m = new Map<string, number>();
    for (const o of orgRows) m.set(fn(o), (m.get(fn(o)) ?? 0) + 1);
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };
  const tenantsPorVertical = countBy(
    (o) => ((o as { verticals: { key: string } | null }).verticals?.key ?? 'sin vertical'),
  );
  const tenantsPorPlan = countBy(
    (o) => ((o as { plans: { name: string } | null }).plans?.name ?? 'Sin plan'),
  );

  // --- Altas de tenants por mes (últimos 6) ---
  const altasPorMes: { month: string; count: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const m = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth() + i, 1);
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    altasPorMes.push({
      month: m.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }).replace('.', ''),
      count: orgRows.filter((o: { created_at: string }) => {
        const d = new Date(o.created_at);
        return d >= m && d < next;
      }).length,
    });
  }

  // --- Salud (misma lógica que /api/admin/health, con errores reales) ---
  const inc = incidents ?? [];
  const failingStripe = inc.filter((i: { severity: string }) => i.severity === 'critical').length;
  const salud = [
    { label: 'API', value: (errores24h ?? 0) === 0 ? 'OK' : `${errores24h} ${errores24h === 1 ? 'error' : 'errores'} 24h`, ok: (errores24h ?? 0) === 0 },
    { label: 'Incidencias', value: inc.length ? `${inc.length} abiertas` : 'OK', ok: inc.length === 0 },
    { label: 'Críticas', value: failingStripe ? `${failingStripe}` : 'OK', ok: failingStripe === 0 },
    { label: 'Agente IA', value: `${iaConvs ?? 0} conv. en ${days}d`, ok: true },
  ];

  const errores = ((erroresRecientes ?? []) as {
    created_at: string;
    route: string;
    method: string;
    message: string;
    organization_id: string | null;
  }[]).map((e) => ({
    at: e.created_at,
    route: e.route,
    method: e.method,
    message: e.message,
    orgName: e.organization_id
      ? ((orgById.get(e.organization_id) as { name?: string } | undefined)?.name ?? null)
      : null,
  }));

  return ok({
    range: { days, from: localYmd(rangeStart), to: localYmd(todayStart) },
    kpis: {
      tenants: { activos, total: orgRows.length, nuevosMes },
      mrr: Math.round(mrr),
      usuarios: { total: profilesCount ?? 0, activos7d: usuariosActivos7d },
      gmv: { total: Math.round(gmv), pedidos: orderRows.length },
      errores24h: errores24h ?? 0,
      incidenciasAbiertas: inc.length,
      conversacionesIa: iaConvs ?? 0,
    },
    docsCount,
    gmvTrend,
    topTenants,
    tenantsPorVertical,
    tenantsPorPlan,
    altasPorMes,
    salud,
    errores,
  });
});
