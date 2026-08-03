import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { TablesUpdate } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  serie: z.string().min(1).optional(),
  prefix: z.string().optional(),
  nextValue: z.number().int().min(1).optional(),
});

// PATCH /api/erp/config/series/[id] — edición de serie (config/configurar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const supabase = erpClientFor(session);
  const b = Patch.parse(await req.json());

  const update: TablesUpdate<'org_series'> = {};
  if (b.serie !== undefined) update.serie = b.serie;
  if (b.prefix !== undefined) update.prefix = b.prefix;
  if (b.nextValue !== undefined) update.next_value = b.nextValue;

  if (Object.keys(update).length === 0) return ok({ ok: true });

  const { error } = await supabase.from('org_series').update(update).eq('id', params.id);
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: config/configurar');
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true });
});
