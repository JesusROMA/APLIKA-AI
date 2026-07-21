import { handle, ok } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getErpClient } from '@/lib/erp/db';
import { readImpersonationCookie } from '@/lib/erp/impersonation';
import { fetchVentasCatalogs } from '@/lib/erp/catalogs';

export const dynamic = 'force-dynamic';

// GET /api/erp/catalogs/ventas — catálogos SAT de pago (forma/método) para los
// selects de facturación. Globales; solo requieren sesión válida.
export const GET = handle(async () => {
  const ctx = await requireUser();
  const impersonate = ctx.role === 'super_admin' ? readImpersonationCookie() : null;
  const supabase = getErpClient(impersonate);
  return ok(await fetchVentasCatalogs(supabase));
});
