import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { nextSerieFolio } from '@/lib/erp/folios';
import type { PurchaseOrderStatus } from '@/lib/types/erp-compras';
import {
  createPoSchema,
  buildPoLines,
  computePoTotals,
  poItemInsertsFor,
  mapPoRow,
  type PoHeaderRow,
} from './_shared';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, folio, supplier_id, warehouse_id, status, expected_date, subtotal, tax, total, created_at, suppliers ( name )';

const DB_STATUSES = new Set<PurchaseOrderStatus>([
  'borrador',
  'confirmada',
  'recibida_parcial',
  'recibida',
  'cancelada',
]);

// GET /api/erp/purchase-orders — listado paginado (compras/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('purchase_orders').select(SELECT, { count: 'exact' });

  if (status && DB_STATUSES.has(status as PurchaseOrderStatus)) {
    q = q.eq('status', status as PurchaseOrderStatus);
  }

  // Búsqueda por folio o por nombre de proveedor (resolviendo ids del maestro).
  if (search) {
    const { data: sups } = await supabase
      .from('suppliers')
      .select('id')
      .ilike('name', `%${search}%`);
    const supIds = (sups ?? []).map((s) => s.id);
    const ors = [`folio.ilike.%${search}%`];
    if (supIds.length) ors.push(`supplier_id.in.(${supIds.join(',')})`);
    q = q.or(ors.join(','));
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = ((data ?? []) as PoHeaderRow[]).map(mapPoRow);
  return ok(paginated(rows, page, pageSize, count));
});

// POST /api/erp/purchase-orders — alta en borrador (compras/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const body = createPoSchema.parse(await req.json());

  const folio = await nextSerieFolio(supabase, orgId, 'purchase');
  const lines = await buildPoLines(supabase, body.lines);
  const totals = computePoTotals(lines);

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .insert({
      organization_id: orgId,
      folio,
      supplier_id: body.supplierId,
      warehouse_id: body.warehouseId ?? null,
      status: 'borrador',
      expected_date: body.expectedDate ?? null,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      notas: body.notas ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  const { error: itemsErr } = await supabase
    .from('purchase_order_items')
    .insert(poItemInsertsFor(po.id, orgId, lines));
  if (itemsErr) throw new ApiError(400, itemsErr.message);

  return ok({ ok: true, id: po.id }, { status: 201 });
});
