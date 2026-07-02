import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { initials, dateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

// GET /api/admin/tenants?status={tenantFilter}&vertical={verticalKey}
// Vista global (cross-tenant) legítima de super_admin vía service-role.
export const GET = handle(async (req) => {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'todos';
  const vertical = url.searchParams.get('vertical') ?? 'todos';

  let query = admin
    .from('organizations')
    .select('id, name, status, created_at, vertical_id, plans ( name, max_products ), verticals ( key, name )')
    .order('created_at', { ascending: false });
  if (status && status !== 'todos') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;

  let rows = data ?? [];
  if (vertical && vertical !== 'todos') {
    rows = rows.filter((t: any) => t.verticals?.key === vertical);
  }

  // Uso aproximado = productos / límite del plan
  const tenants = await Promise.all(
    rows.map(async (t: any) => {
      const { count } = await admin
        .from('product_variants')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', t.id);
      const max = t.plans?.max_products ?? 5000;
      const uso = max ? Math.min(100, Math.round(((count ?? 0) / max) * 100)) : 0;
      return {
        id: t.id,
        name: t.name,
        plan: t.plans?.name ?? '—',
        status: t.status,
        alta: dateLong(t.created_at),
        uso,
        ini: initials(t.name),
        vertical: t.verticals?.key ?? null,
        verticalName: t.verticals?.name ?? 'Sin vertical',
      };
    }),
  );

  return ok({ tenants });
});

const NewTenant = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug: solo minúsculas, números y guiones'),
  verticalKey: z.string().min(1),
  planKey: z.string().default('basico'),
  status: z.enum(['activo', 'prueba', 'suspendido']).default('prueba'),
});

// POST /api/admin/tenants — alta de tenant con vertical (el trigger de BD
// asigna los módulos default del vertical; editables después con los toggles).
export const POST = handle(async (req) => {
  await requireSuperAdmin();
  const body = NewTenant.parse(await req.json());
  const admin = createSupabaseAdminClient();

  const [{ data: vertical }, { data: plan }] = await Promise.all([
    admin.from('verticals').select('id').eq('key', body.verticalKey).maybeSingle(),
    admin.from('plans').select('id').eq('key', body.planKey).maybeSingle(),
  ]);
  if (!vertical) throw new ApiError(422, 'Vertical no válido');

  const { data, error } = await admin
    .from('organizations')
    .insert({
      name: body.name,
      slug: body.slug,
      status: body.status,
      vertical_id: (vertical as any).id,
      plan_id: (plan as any)?.id ?? null,
    })
    .select('id, name, slug')
    .single();
  if (error) throw new ApiError(400, error.message);

  return ok({ ok: true, tenant: data }, { status: 201 });
});
