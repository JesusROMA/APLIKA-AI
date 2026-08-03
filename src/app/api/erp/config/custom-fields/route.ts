import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { CustomFieldDef, CustomFieldType } from '@/lib/types/erp-config';

export const dynamic = 'force-dynamic';

/**
 * La BD persiste el tipo booleano como `'bool'` (check de custom_field_defs),
 * pero el contrato (`CustomFieldType`) lo expone como `'boolean'`. Se traduce en
 * ambos sentidos aquí para que el panel y `<CustomFields>` hablen `'boolean'`.
 */
function toFieldType(dbType: string): CustomFieldType {
  return dbType === 'bool' ? 'boolean' : (dbType as CustomFieldType);
}
function toDbType(fieldType: CustomFieldType): string {
  return fieldType === 'boolean' ? 'bool' : fieldType;
}

/** Mapea una fila cruda de custom_field_defs al contrato del panel. */
function mapDef(row: {
  id: string;
  module_key: string;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  options: unknown;
  sort: number;
  active: boolean;
}): CustomFieldDef {
  return {
    id: row.id,
    moduleKey: row.module_key,
    fieldKey: row.field_key,
    label: row.label,
    fieldType: toFieldType(row.field_type),
    required: row.required,
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
    sort: row.sort,
    active: row.active,
  };
}

// GET /api/erp/config/custom-fields[?moduleKey=] — defs del tenant (config/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'ver');
  const supabase = erpClientFor(session);

  const moduleKey = new URL(req.url).searchParams.get('moduleKey');
  let q = supabase
    .from('custom_field_defs')
    .select('id, module_key, field_key, label, field_type, required, options, sort, active');
  if (moduleKey) q = q.eq('module_key', moduleKey);
  const { data, error } = await q.order('module_key').order('sort');
  if (error) throw new ApiError(400, error.message);

  const rows: CustomFieldDef[] = (data ?? []).map(mapDef);
  return ok({ data: rows });
});

const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;

const NewDef = z.object({
  moduleKey: z.string().min(1),
  fieldKey: z.string().min(1),
  label: z.string().min(1),
  fieldType: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  sort: z.number().int().optional(),
  active: z.boolean().optional(),
});

// POST /api/erp/config/custom-fields — alta de def (config/configurar)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const supabase = erpClientFor(session);
  const b = NewDef.parse(await req.json());

  const { data, error } = await supabase
    .from('custom_field_defs')
    .insert({
      organization_id: session.organization!.id,
      module_key: b.moduleKey,
      field_key: b.fieldKey,
      label: b.label,
      field_type: toDbType(b.fieldType),
      required: b.required ?? false,
      options: b.options ?? [],
      sort: b.sort ?? 0,
      active: b.active ?? true,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: config/configurar');
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true, id: data.id }, { status: 201 });
});
