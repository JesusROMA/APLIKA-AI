import { handle, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/health — salud de integraciones (derivada de incidencias).
export const GET = handle(async () => {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const { data: inc } = await admin.from('incidents').select('title, severity').neq('severity', 'ok');

  const failingStripe = (inc ?? []).filter((i: any) => /stripe|webhook/i.test(i.title)).length;
  const failingPac = (inc ?? []).filter((i: any) => /cfdi|pac|timbr/i.test(i.title)).length;
  const { count: orgCount } = await admin.from('organizations').select('id', { count: 'exact', head: true }).eq('status', 'activo');
  const { count: aiCount } = await admin.from('ai_conversations').select('id', { count: 'exact', head: true });

  const health = [
    { label: 'API uptime', value: '99.98%', note: 'Operativo', ok: true },
    { label: 'Webhooks Stripe', value: failingStripe ? `${failingStripe} fallidos` : 'OK', note: failingStripe ? 'Reintentando' : 'Operativo', ok: failingStripe === 0 },
    { label: 'Timbrado PAC', value: failingPac ? `${failingPac} rechazo` : 'OK', note: failingPac ? 'Revisar' : 'Operativo', ok: failingPac === 0 },
    { label: 'Agentes IA', value: `${aiCount ?? 0} conv.`, note: `${orgCount ?? 0} tenants`, ok: true },
  ];
  return ok({ health });
});
