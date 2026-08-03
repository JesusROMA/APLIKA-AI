import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { TablesUpdate } from '@/lib/supabase/database.types';
import type { CustomFieldType } from '@/lib/types/erp-config';

export const dynamic = 'force-dynamic';

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;

/** El contrato usa `'boolean'`; la BD persiste `'bool'`. */
function toDbType(fieldType: CustomFieldType): string {
  return fieldType === 'boolean' ? 'bool' : fieldType;
}

const Patch = z.object({
  label: z.string().min(1).optional(),
  fieldType: z.enum(FIELD_TYPES).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  sort: z.number().int().optional(),
  active: z.boolean().optional(),
});

// PATCH /api/erp/config/custom-fields/[id] — edición de def (config/configurar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const supabase = erpClientFor(session);
  const b = Patch.parse(await req.json());

  const update: TablesUpdate<'custom_field_defs'> = {};
  if (b.label !== undefined) update.label = b.label;
  if (b.fieldType !== undefined) update.field_type = toDbType(b.fieldType);
  if (b.required !== undefined) update.required = b.required;
  if (b.options !== undefined) update.options = b.options;
  if (b.sort !== undefined) update.sort = b.sort;
  if (b.active !== undefined) update.active = b.active;

  if (Object.keys(update).length === 0) return ok({ ok: true });

  const { error } = await supabase.from('custom_field_defs').update(update).eq('id', params.id);
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: config/configurar');
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true });
});

// DELETE /api/erp/config/custom-fields/[id] — baja de def (config/configurar)
export const DELETE = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const supabase = erpClientFor(session);

  const { error } = await supabase.from('custom_field_defs').delete().eq('id', params.id);
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: config/configurar');
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true });
});
