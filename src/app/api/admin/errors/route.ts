import { handle, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

/**
 * GET /api/admin/errors?days=1|7|30&route=&limit= — bitácora de errores 5xx de
 * la API (tabla app_errors, 0027) para el módulo Monitoreo: filas recientes,
 * agrupación por ruta (dónde duele más) y serie diaria para ver la tendencia.
 */
export const GET = handle(async (req) => {
  await requireSuperAdmin();
  // any: app_errors (0027) fuera de los tipos generados
  // eslint-disable-next-line
  const admin = createSupabaseAdminClient() as any;

  const url = new URL(req.url);
  const days = [1, 7, 30].includes(Number(url.searchParams.get('days')))
    ? Number(url.searchParams.get('days'))
    : 7;
  const routeFilter = (url.searchParams.get('route') ?? '').trim();
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get('limit')) || 60));
  const since = new Date(Date.now() - days * DAY_MS);

  let q = admin
    .from('app_errors')
    .select('id, created_at, route, method, status, message, stack, organization_id')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (routeFilter) q = q.eq('route', routeFilter);

  const [{ data: rows }, { data: all }, { data: orgs }] = await Promise.all([
    q,
    // Para agrupar por ruta y la serie diaria se leen solo las columnas mínimas.
    admin
      .from('app_errors')
      .select('route, created_at')
      .gte('created_at', since.toISOString())
      .limit(5000),
    admin.from('organizations').select('id, name'),
  ]);

  const orgName = new Map((orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]));

  const byRouteMap = new Map<string, number>();
  const serie = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * DAY_MS);
    const p = (n: number) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, count: 0 };
  });
  const dayIndex = new Map(serie.map((s, i) => [s.date, i]));
  for (const e of (all ?? []) as { route: string; created_at: string }[]) {
    byRouteMap.set(e.route, (byRouteMap.get(e.route) ?? 0) + 1);
    const d = new Date(e.created_at);
    const p = (n: number) => String(n).padStart(2, '0');
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const i = dayIndex.get(key);
    if (i !== undefined) serie[i].count += 1;
  }
  const byRoute = [...byRouteMap.entries()]
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const errores = ((rows ?? []) as {
    id: string;
    created_at: string;
    route: string;
    method: string;
    status: number;
    message: string;
    stack: string | null;
    organization_id: string | null;
  }[]).map((e) => ({
    id: e.id,
    at: e.created_at,
    route: e.route,
    method: e.method,
    status: e.status,
    message: e.message,
    stack: e.stack,
    orgName: e.organization_id ? (orgName.get(e.organization_id) ?? null) : null,
  }));

  return ok({ days, total: (all ?? []).length, errores, byRoute, serie });
});
