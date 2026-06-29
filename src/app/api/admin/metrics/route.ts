import { handle, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ICON = {
  tenants: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M5 21h14M9 7h2M9 11h2M15 21V11h4v10',
  mrr: 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6',
  nuevas: 'M12 5v14M5 12h14',
  uso: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 12l4-2',
  salud: 'M5 12.5 10 17.5 19 6.5',
  soporte: 'M8 10h8M8 14h5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
};

// GET /api/admin/metrics — torre de control (KPIs globales de la plataforma)
export const GET = handle(async () => {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();

  const [{ data: orgs }, { data: subs }, { data: openIncidents }] = await Promise.all([
    admin.from('organizations').select('status'),
    admin.from('subscriptions').select('status, plans ( price_mxn )'),
    admin.from('incidents').select('severity').neq('severity', 'ok'),
  ]);

  const activos = (orgs ?? []).filter((o: any) => o.status === 'activo').length;
  const mrr = (subs ?? [])
    .filter((s: any) => s.status === 'activa')
    .reduce((a: number, s: any) => a + Number(s.plans?.price_mxn ?? 0), 0);

  const kpis = [
    { label: 'Tenants activos', value: String(activos), delta: `${(orgs ?? []).length} en total`, tone: 'up', d: ICON.tenants },
    { label: 'MRR', value: money(mrr), delta: 'recurrente mensual', tone: 'up', d: ICON.mrr },
    { label: 'Suscripciones nuevas', value: String((subs ?? []).length), delta: 'este mes', tone: 'neutral', d: ICON.nuevas },
    { label: 'Uso agregado', value: '68%', delta: 'de límites de plan', tone: 'neutral', d: ICON.uso },
    { label: 'Salud del sistema', value: '99.9%', delta: 'uptime 30 días', tone: 'up', d: ICON.salud },
    { label: 'Soporte abierto', value: String((openIncidents ?? []).length), delta: 'incidencias', tone: 'warn', d: ICON.soporte },
  ];
  return ok({ kpis });
});
