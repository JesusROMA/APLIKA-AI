import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';

export const dynamic = 'force-dynamic';

// GET /api/erp/me — sesión + org + módulos activos + PermissionMap (C2/C3).
// La UI oculta acciones según perms; el servidor manda (guards por endpoint).
export const GET = handle(async () => {
  const session = await getErpSession();
  return ok(session);
});
