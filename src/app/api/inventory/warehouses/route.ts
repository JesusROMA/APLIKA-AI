import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/inventory/warehouses — almacenes del tenant (para selects/filtros)
export const GET = handle(async () => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, name, code, is_default')
    .order('created_at');
  if (error) throw error;
  return ok({ warehouses: data ?? [] });
});
