import { handle, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { money } from '@/lib/format';

export const dynamic = 'force-dynamic';

// GET /api/admin/plans — planes con conteo de tenants por plan.
export const GET = handle(async () => {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();

  const { data: plans, error } = await admin.from('plans').select('*').order('sort');
  if (error) throw error;

  const result = await Promise.all(
    (plans ?? []).map(async (p: any) => {
      const { count } = await admin
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', p.id);
      return {
        name: p.name,
        price: p.price_mxn == null ? 'A medida' : money(p.price_mxn),
        period: p.period ?? '',
        productos: p.max_products == null ? 'Ilimitados' : String(p.max_products),
        pedidos: p.max_orders_month == null ? 'Pedidos ilimitados' : `${p.max_orders_month.toLocaleString('en-US')} pedidos/mes`,
        usuarios: p.max_users == null ? 'Ilimitados' : String(p.max_users),
        tenants: String(count ?? 0),
        highlight: p.highlight,
      };
    }),
  );
  return ok({ planes: result });
});
