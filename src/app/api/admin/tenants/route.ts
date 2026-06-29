import { handle, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { initials, dateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

// GET /api/admin/tenants?status={tenantFilter}
// Vista global (cross-tenant) legítima de super_admin vía service-role.
export const GET = handle(async (req) => {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const status = new URL(req.url).searchParams.get('status') ?? 'todos';

  let query = admin
    .from('organizations')
    .select('id, name, status, created_at, plans ( name, max_products )')
    .order('created_at', { ascending: false });
  if (status && status !== 'todos') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;

  // Uso aproximado = productos / límite del plan
  const tenants = await Promise.all(
    (data ?? []).map(async (t: any) => {
      const { count } = await admin
        .from('product_variants')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', t.id);
      const max = t.plans?.max_products ?? 5000;
      const uso = max ? Math.min(100, Math.round(((count ?? 0) / max) * 100)) : 0;
      return {
        name: t.name,
        plan: t.plans?.name ?? '—',
        status: t.status,
        alta: dateLong(t.created_at),
        uso,
        ini: initials(t.name),
      };
    }),
  );

  return ok({ tenants });
});
