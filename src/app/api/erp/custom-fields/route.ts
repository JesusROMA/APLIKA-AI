import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { CustomFieldDef, CustomFieldType } from '@/lib/types/erp-config';

export const dynamic = 'force-dynamic';

const TYPES: CustomFieldType[] = ['text', 'number', 'date', 'select', 'boolean'];
function normalizeType(t: string): CustomFieldType {
  if (t === 'bool') return 'boolean';
  return (TYPES as string[]).includes(t) ? (t as CustomFieldType) : 'text';
}

/**
 * GET /api/erp/custom-fields?moduleKey=maestros — definiciones ACTIVAS para
 * renderizar campos personalizados en formularios (lectura para usuarios de
 * maestros; la administración de defs vive en /api/erp/config/custom-fields).
 * RLS de custom_field_defs = org-match.
 */
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'ver');
  const supabase = erpClientFor(session);
  const moduleKey = new URL(req.url).searchParams.get('moduleKey') ?? 'maestros';

  const { data, error } = await supabase
    .from('custom_field_defs')
    .select('id, module_key, field_key, label, field_type, required, options, sort, active')
    .eq('module_key', moduleKey)
    .eq('active', true)
    .order('sort');
  if (error) throw error;

  const rows: CustomFieldDef[] = (data ?? []).map((d) => ({
    id: d.id,
    moduleKey: d.module_key,
    fieldKey: d.field_key,
    label: d.label,
    fieldType: normalizeType(d.field_type),
    required: d.required,
    options: Array.isArray(d.options) ? (d.options as string[]) : [],
    sort: d.sort,
    active: d.active,
  }));
  return ok({ data: rows });
});
