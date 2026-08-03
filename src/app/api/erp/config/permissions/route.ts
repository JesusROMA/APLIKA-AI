import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { fetchPermissionMatrix } from '@/lib/erp/config';
import { ALL_ACTIONS, ALL_MODULE_KEYS } from '@/lib/erp/constants';
import type { PermissionCell } from '@/lib/types/erp-config';
import type { Database } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

// GET /api/erp/config/permissions — matriz efectiva del tenant (config/ver)
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'ver');
  const supabase = erpClientFor(session);

  const data: PermissionCell[] = await fetchPermissionMatrix(
    supabase,
    session.organization!.id,
  );
  return ok({ data });
});

// Sólo roles de tenant pueden overridearse (super_admin siempre es all-true).
const TENANT_ROLES = ['tenant_admin', 'tenant_user', 'tenant_viewer'] as const;

const Override = z.object({
  role: z.enum(TENANT_ROLES),
  moduleKey: z.enum(ALL_MODULE_KEYS as [string, ...string[]]),
  action: z.enum(ALL_ACTIONS as [string, ...string[]]),
  allowed: z.boolean(),
});

// PUT /api/erp/config/permissions — upsert de override del tenant (config/configurar)
export const PUT = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const supabase = erpClientFor(session);
  const b = Override.parse(await req.json());

  const row: Database['public']['Tables']['role_permissions']['Insert'] = {
    organization_id: session.organization!.id,
    role: b.role,
    module_key: b.moduleKey,
    action: b.action,
    allowed: b.allowed,
  };

  // Upsert sobre la unique (organization_id, role, module_key, action). NO se
  // borra el override aunque iguale al default (DELETE es super_admin por RLS).
  const { error } = await supabase
    .from('role_permissions')
    .upsert(row, { onConflict: 'organization_id,role,module_key,action' });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: config/configurar');
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true });
});
