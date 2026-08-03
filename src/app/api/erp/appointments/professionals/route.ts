import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { fetchProfessionals } from '@/lib/erp/clinica';

export const dynamic = 'force-dynamic';

// GET /api/erp/appointments/professionals — perfiles asignables (calendario/ver).
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'calendario', 'ver');
  const supabase = erpClientFor(session);
  const data = await fetchProfessionals(supabase, session.organization!.id);
  return ok({ data });
});
