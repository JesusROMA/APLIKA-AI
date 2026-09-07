import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { genTempPassword, listOrgUsers, TENANT_ROLES } from './_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/users — usuarios de la organización con estado de acceso
// (config/configurar: gestión de usuarios = función del dueño/admin).
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const users = await listOrgUsers(session.organization!.id);
  return ok({ data: users });
});

const NewUser = z.object({
  email: z.string().email('Correo inválido'),
  fullName: z.string().trim().min(1, 'Escribe el nombre'),
  role: z.enum(TENANT_ROLES),
});

// POST /api/erp/users — invita (crea) un usuario del tenant con contraseña
// temporal que se muestra UNA vez. El trigger handle_new_user crea el profile
// con el rol del metadata; aquí solo se liga a la organización.
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const orgId = session.organization!.id;
  const b = NewUser.parse(await req.json());

  const admin = createSupabaseAdminClient();
  const tempPassword = genTempPassword();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: b.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: b.fullName, role: b.role },
  });
  if (error || !created.user) {
    throw new ApiError(400, /already/i.test(error?.message ?? '') ? 'Ese correo ya tiene cuenta' : (error?.message ?? 'No se pudo crear el usuario'));
  }

  // Liga a la organización (el trigger ya insertó el profile con rol/nombre).
  const { error: pErr } = await admin
    .from('profiles')
    .update({ organization_id: orgId, role: b.role, full_name: b.fullName })
    .eq('id', created.user.id);
  if (pErr) throw new ApiError(400, pErr.message);

  await admin.from('audit_log').insert({
    organization_id: orgId,
    actor_id: session.userId,
    entity_type: 'user',
    entity_id: created.user.id,
    action: 'crear',
    detail: { email: b.email, role: b.role },
  });

  return ok(
    { ok: true, id: created.user.id, tempPassword },
    { status: 201 },
  );
});
