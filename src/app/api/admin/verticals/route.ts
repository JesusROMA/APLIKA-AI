import { handle, ok } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/verticals — catálogo de verticales (para filtro y alta de tenant)
export const GET = handle(async () => {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('verticals')
    .select('key, name, description, default_modules')
    .order('key');
  if (error) throw error;
  return ok({
    verticals: (data ?? []).map((v: any) => ({
      key: v.key,
      name: v.name,
      description: v.description,
      defaultModules: v.default_modules ?? [],
    })),
  });
});
