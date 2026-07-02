import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET /api/admin/tenants/{id}/modules — catálogo completo con estado por tenant
export const GET = handle(async (_req, { params }) => {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();

  const [{ data: all, error }, { data: active }] = await Promise.all([
    admin.from('modules').select('id, key, name, icon, core, sort').order('sort'),
    admin.from('organization_modules').select('module_id, enabled').eq('organization_id', params.id),
  ]);
  if (error) throw error;

  const stateById = new Map((active ?? []).map((r: any) => [r.module_id, r.enabled]));
  const modules = (all ?? []).map((m: any) => ({
    key: m.key,
    name: m.name,
    core: m.core,
    enabled: m.core ? true : (stateById.get(m.id) ?? false),
  }));

  return ok({ modules });
});

const Toggle = z.object({
  moduleKey: z.string().min(1),
  enabled: z.boolean(),
});

// PATCH /api/admin/tenants/{id}/modules — activar/desactivar un módulo.
// Los módulos core (dashboard, config) no se pueden desactivar.
export const PATCH = handle(async (req, { params }) => {
  await requireSuperAdmin();
  const { moduleKey, enabled } = Toggle.parse(await req.json());
  const admin = createSupabaseAdminClient();

  const { data: mod, error: mErr } = await admin
    .from('modules')
    .select('id, core')
    .eq('key', moduleKey)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!mod) throw new ApiError(404, 'Módulo no encontrado');
  if ((mod as any).core && !enabled) throw new ApiError(400, 'Los módulos core no se pueden desactivar');

  const { error } = await admin.from('organization_modules').upsert(
    {
      organization_id: params.id,
      module_id: (mod as any).id,
      enabled,
    },
    { onConflict: 'organization_id,module_id' },
  );
  if (error) throw new ApiError(400, error.message);

  return ok({ ok: true, moduleKey, enabled });
});
