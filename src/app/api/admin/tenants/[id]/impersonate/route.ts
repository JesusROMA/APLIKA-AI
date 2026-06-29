import { handle, ok, ApiError } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// POST /api/admin/tenants/{id}/impersonate
// Impersonación de soporte: registra la acción en bitácora (auditoría) y
// devuelve el panel destino. La sesión queda registrada como exige la UI.
export const POST = handle(async (_req, { params }) => {
  const ctx = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();

  const { data: org, error } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw error;
  if (!org) throw new ApiError(404, 'Tenant no encontrado');

  // Bitácora de impersonación (auditoría)
  await admin.from('incidents').insert({
    organization_id: (org as any).id,
    title: 'Sesión de soporte (impersonación)',
    detail: `super_admin ${ctx.email} entró al panel de ${(org as any).name}`,
    severity: 'ok',
  });

  return ok({ ok: true, organization: org, redirect: '/dc/Panel Cliente.dc.html' });
});
