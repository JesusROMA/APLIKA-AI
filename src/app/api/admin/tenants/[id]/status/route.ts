import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireSuperAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const Body = z.object({ status: z.enum(['activo', 'prueba', 'suspendido']) });

// PATCH /api/admin/tenants/{id}/status — alta/suspensión de tenant
export const PATCH = handle(async (req, { params }) => {
  await requireSuperAdmin();
  const { status } = Body.parse(await req.json());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('organizations').update({ status }).eq('id', params.id);
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true });
});
