import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { fetchModulesWithState } from '@/lib/erp/config';
import { CORE_MODULES } from '@/lib/erp/constants';
import type { ModuleKey } from '@/lib/types/erp';
import type { ModuleToggleRow } from '@/lib/types/erp-config';

export const dynamic = 'force-dynamic';

// GET /api/erp/config/modules — catálogo de módulos + estado (config/ver)
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'ver');
  const supabase = erpClientFor(session);

  const data: ModuleToggleRow[] = await fetchModulesWithState(
    supabase,
    session.organization!.id,
  );
  return ok({ data });
});

const Toggle = z.object({
  moduleKey: z.string().min(1),
  enabled: z.boolean(),
});

// POST /api/erp/config/modules — activa/desactiva un módulo (config/configurar)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const supabase = erpClientFor(session);
  const b = Toggle.parse(await req.json());

  // Los módulos core (dashboard/config/maestros) no se pueden apagar/togglear.
  if (CORE_MODULES.has(b.moduleKey as ModuleKey)) {
    throw new ApiError(422, `Módulo core; no se puede modificar: ${b.moduleKey}`);
  }

  const { error } = await supabase.rpc('set_org_module', {
    p_module_key: b.moduleKey,
    p_enabled: b.enabled,
  });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: config/configurar');
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true });
});
