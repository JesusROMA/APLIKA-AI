import { NextResponse } from 'next/server';
import { handle, ApiError } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  IMPERSONATE_COOKIE,
  IMPERSONATE_MAX_AGE,
  signImpersonation,
} from '@/lib/erp/impersonation';

export const dynamic = 'force-dynamic';

const cookieBase = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
};

// POST /api/admin/tenants/{id}/impersonate — inicia sesión de impersonación
// (C1.3 v2): setea cookie httpOnly firmada `aplika_impersonate=<org_id>`, deja
// bitácora (incidents + audit_log) y devuelve el tenant destino.
export const POST = handle(async (_req, { params }) => {
  const ctx = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();

  const { data: org, error } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw error;
  if (!org) throw new ApiError(404, 'Tenant no encontrado');
  const orgRow = org as { id: string; name: string; slug: string };

  // Bitácora de soporte (feed de incidentes del panel dc — se conserva)
  await admin.from('incidents').insert({
    organization_id: orgRow.id,
    title: 'Sesión de soporte (impersonación)',
    detail: `super_admin ${ctx.email} entró al panel de ${orgRow.name}`,
    severity: 'ok',
  });

  // Bitácora transversal F0 (C1.4): el inicio de impersonación queda en audit_log.
  // Se inserta con service_role (el helper app.log_audit no aplica sin JWT del actor).
  await admin.from('audit_log').insert({
    organization_id: orgRow.id,
    actor_id: ctx.userId,
    entity_type: 'impersonation',
    entity_id: orgRow.id,
    action: 'impersonar',
    detail: { email: ctx.email },
  });

  const res = NextResponse.json({
    ok: true,
    organization: { id: orgRow.id, name: orgRow.name, slug: orgRow.slug },
    redirect: '/panel',
  });
  res.cookies.set(IMPERSONATE_COOKIE, signImpersonation(orgRow.id), {
    ...cookieBase,
    maxAge: IMPERSONATE_MAX_AGE,
  });
  return res;
});

// DELETE /api/admin/tenants/{id}/impersonate — termina la impersonación.
export const DELETE = handle(async () => {
  await requireSuperAdmin();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(IMPERSONATE_COOKIE, '', { ...cookieBase, maxAge: 0 });
  return res;
});
