import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { nextSerieFolio } from '@/lib/erp/folios';
import type { RequisitionRow, RequisitionStatus } from '@/lib/types/erp-compras';
import { createReqSchema, buildReqLines, reqItemInsertsFor } from './_shared';

export const dynamic = 'force-dynamic';

const SELECT = 'id, folio, status, notas, created_at, requisition_items ( count )';

const DB_STATUSES = new Set<RequisitionStatus>([
  'borrador',
  'aprobada',
  'rechazada',
  'convertida',
  'cancelada',
]);

// GET /api/erp/requisitions — listado paginado (compras/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('requisitions').select(SELECT, { count: 'exact' });

  if (status && DB_STATUSES.has(status as RequisitionStatus)) {
    q = q.eq('status', status as RequisitionStatus);
  }
  if (search) q = q.ilike('folio', `%${search}%`);

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows: RequisitionRow[] = (data ?? []).map((r) => ({
    id: r.id,
    folio: r.folio,
    status: r.status,
    notas: r.notas,
    itemCount: r.requisition_items?.[0]?.count ?? 0,
    createdAt: r.created_at,
  }));
  return ok(paginated(rows, page, pageSize, count));
});

// POST /api/erp/requisitions — alta en borrador (compras/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const body = createReqSchema.parse(await req.json());

  const folio = await nextSerieFolio(supabase, orgId, 'requisition');
  const lines = await buildReqLines(supabase, body.lines);

  const { data: reqRow, error } = await supabase
    .from('requisitions')
    .insert({
      organization_id: orgId,
      folio,
      status: 'borrador',
      notas: body.notas ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  const { error: itemsErr } = await supabase
    .from('requisition_items')
    .insert(reqItemInsertsFor(reqRow.id, orgId, lines));
  if (itemsErr) throw new ApiError(400, itemsErr.message);

  return ok({ ok: true, id: reqRow.id }, { status: 201 });
});
