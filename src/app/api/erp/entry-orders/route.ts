import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { nextSerieFolio } from '@/lib/erp/folios';
import type { EntryOrderStatus, EntryOrigin } from '@/lib/types/erp-compras';
import {
  createEntrySchema,
  buildEntryItems,
  entryItemInsertsFor,
  mapEntryRow,
  ENTRY_STATUSES,
  ENTRY_ORIGINS,
  type EoHeaderRow,
} from './_shared';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, folio, warehouse_id, origin, purchase_order_id, status, applied_at, created_at, warehouses ( name )';

// GET /api/erp/entry-orders — listado paginado (inventario/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'ver');
  const supabase = erpClientFor(session);

  const url = new URL(req.url);
  const { page, pageSize, search, status } = parseListParams(url);
  const origin = url.searchParams.get('origin')?.trim() || undefined;
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('entry_orders').select(SELECT, { count: 'exact' });

  if (status && ENTRY_STATUSES.has(status as EntryOrderStatus)) {
    q = q.eq('status', status as EntryOrderStatus);
  }
  if (origin && ENTRY_ORIGINS.has(origin as EntryOrigin)) {
    q = q.eq('origin', origin);
  }
  if (search) {
    q = q.ilike('folio', `%${search}%`);
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = ((data ?? []) as EoHeaderRow[]).map(mapEntryRow);
  return ok(paginated(rows, page, pageSize, count));
});

// POST /api/erp/entry-orders — alta en borrador (inventario/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const body = createEntrySchema.parse(await req.json());

  const folio = await nextSerieFolio(supabase, orgId, 'entry');
  const items = await buildEntryItems(supabase, body.items);

  const { data: eo, error } = await supabase
    .from('entry_orders')
    .insert({
      organization_id: orgId,
      folio,
      warehouse_id: body.warehouseId,
      origin: body.origin,
      purchase_order_id: body.purchaseOrderId ?? null,
      status: 'borrador',
      notas: body.notas ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  const { error: itemsErr } = await supabase
    .from('entry_order_items')
    .insert(entryItemInsertsFor(eo.id, orgId, items));
  if (itemsErr) throw new ApiError(400, itemsErr.message);

  return ok({ ok: true, id: eo.id }, { status: 201 });
});
