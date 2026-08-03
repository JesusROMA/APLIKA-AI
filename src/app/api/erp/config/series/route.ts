import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { ConfigSeriesRow } from '@/lib/types/erp-config';

export const dynamic = 'force-dynamic';

// GET /api/erp/config/series — series de folio del tenant (config/ver)
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('org_series')
    .select('id, doc_type, serie, prefix, next_value, is_default')
    .order('doc_type')
    .order('serie');
  if (error) throw new ApiError(400, error.message);

  const rows: ConfigSeriesRow[] = (data ?? []).map((s) => ({
    id: s.id,
    docType: s.doc_type,
    serie: s.serie,
    prefix: s.prefix,
    nextValue: s.next_value,
    isDefault: s.is_default,
  }));
  return ok({ data: rows });
});

const NewSeries = z.object({
  docType: z.string().min(1),
  serie: z.string().min(1),
  prefix: z.string(),
  nextValue: z.number().int().min(1).optional(),
});

// POST /api/erp/config/series — alta de serie (config/configurar)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'configurar');
  const supabase = erpClientFor(session);
  const b = NewSeries.parse(await req.json());

  const { data, error } = await supabase
    .from('org_series')
    .insert({
      organization_id: session.organization!.id,
      doc_type: b.docType,
      serie: b.serie,
      prefix: b.prefix,
      next_value: b.nextValue ?? 1,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: config/configurar');
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true, id: data.id }, { status: 201 });
});
