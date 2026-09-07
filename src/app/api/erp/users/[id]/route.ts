import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { loadTargetProfile, TENANT_ROLES } from '../_shared';

export const dynamic = 'force-dynamic';

const Patch = z
  .object({
    role: z.enum(TENANT_ROLES).optional(),
    /** true = suspender acceso (ban); false = reactivar. */
    suspended: z.boolean().optional(),
  })
  .refine((b) => b.role !== undefined || b.suspended !== undefined, {
    message: 'Nada que actualizar',
  });

// PATCH /api/erp/users/[id] — cambia rol y/o suspende/reactiva el acceso
// (config/configurar). No aplica sobre uno mismo ni sobre super_admins.
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const orgId = session.organization!.id;
  const b = Patch.parse(await req.json());

  const target = await loadTargetProfile(orgId, params.id, session.userId);
  const admin = createSupabaseAdminClient();

  if (b.role && b.role !== target.role) {
    const { error } = await admin.from('profiles').update({ role: b.role }).eq('id', target.id);
    if (error) throw new ApiError(400, error.message);
  }

  if (b.suspended !== undefined) {
    // Suspensión = ban largo en Supabase Auth (revierte con 'none').
    const { error } = await admin.auth.admin.updateUserById(target.id, {
      ban_duration: b.suspended ? '876000h' : 'none',
    });
    if (error) throw new ApiError(400, error.message);
  }

  await admin.from('audit_log').insert({
    organization_id: orgId,
    actor_id: session.userId,
    entity_type: 'user',
    entity_id: target.id,
    action: 'editar',
    detail: { email: target.email, ...(b.role ? { role: b.role } : {}), ...(b.suspended !== undefined ? { suspended: b.suspended } : {}) },
  });

  return ok({ ok: true });
});
