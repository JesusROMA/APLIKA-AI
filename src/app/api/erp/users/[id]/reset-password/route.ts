import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { genTempPassword, loadTargetProfile } from '../../_shared';

export const dynamic = 'force-dynamic';

// POST /api/erp/users/[id]/reset-password — genera una contraseña temporal
// nueva y la regresa UNA vez (config/configurar). El usuario debe cambiarla.
export const POST = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const orgId = session.organization!.id;

  const target = await loadTargetProfile(orgId, params.id, session.userId);
  const admin = createSupabaseAdminClient();

  const tempPassword = genTempPassword();
  const { error } = await admin.auth.admin.updateUserById(target.id, { password: tempPassword });
  if (error) throw new ApiError(400, error.message);

  await admin.from('audit_log').insert({
    organization_id: orgId,
    actor_id: session.userId,
    entity_type: 'user',
    entity_id: target.id,
    action: 'editar',
    detail: { email: target.email, resetPassword: true },
  });

  return ok({ ok: true, tempPassword });
});
