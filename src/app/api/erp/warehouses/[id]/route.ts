import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { TablesUpdate } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  name: z.string().min(1).optional(),
  code: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

// PATCH /api/erp/warehouses/[id] — edición (maestros/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'editar');
  const supabase = erpClientFor(session);
  const b = Patch.parse(await req.json());

  const update: TablesUpdate<'warehouses'> = {};
  if (b.name !== undefined) update.name = b.name;
  if (b.code !== undefined) update.code = b.code;
  if (b.isDefault !== undefined) update.is_default = b.isDefault;

  if (Object.keys(update).length === 0) return ok({ ok: true });

  const { error } = await supabase.from('warehouses').update(update).eq('id', params.id);
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true });
});
