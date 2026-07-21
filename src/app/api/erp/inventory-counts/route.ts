import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { nextSerieFolio } from '@/lib/erp/folios';
import type { CountRow, CountStatus } from '@/lib/types/erp-inventario';
import type { TablesInsert } from '@/lib/supabase/database.types';
import { COUNT_DOC_TYPE, countItemsByCount, relName } from './_shared';

export const dynamic = 'force-dynamic';

const LIST_SELECT =
  'id, folio, warehouse_id, status, created_at, applied_at, warehouses ( name )';

const DB_STATUSES = new Set<CountStatus>(['borrador', 'en_conteo', 'aplicado', 'cancelada']);

// GET /api/erp/inventory-counts — listado paginado (inventario/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('inventory_counts').select(LIST_SELECT, { count: 'exact' });

  if (status && DB_STATUSES.has(status as CountStatus)) {
    q = q.eq('status', status as CountStatus);
  }

  // Búsqueda por folio o por nombre de almacén (resolviendo ids del maestro).
  if (search) {
    const { data: whs } = await supabase
      .from('warehouses')
      .select('id')
      .ilike('name', `%${search}%`);
    const whIds = (whs ?? []).map((w) => w.id);
    const ors = [`folio.ilike.%${search}%`];
    if (whIds.length) ors.push(`warehouse_id.in.(${whIds.join(',')})`);
    q = q.or(ors.join(','));
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rowsRaw = data ?? [];
  const itemCounts = await countItemsByCount(
    supabase,
    rowsRaw.map((r) => r.id),
  );

  const rows: CountRow[] = rowsRaw.map((r) => ({
    id: r.id,
    folio: r.folio,
    warehouseId: r.warehouse_id,
    warehouseName: relName(r.warehouses),
    status: r.status as CountStatus,
    createdAt: r.created_at,
    appliedAt: r.applied_at,
    itemCount: itemCounts[r.id] ?? 0,
  }));

  return ok(paginated(rows, page, pageSize, count));
});

const createSchema = z.object({
  warehouseId: z.string().uuid(),
  notas: z.string().trim().max(2000).optional(),
  variantIds: z.array(z.string().uuid()).optional(),
});

// POST /api/erp/inventory-counts — alta en borrador + siembra de partidas (inventario/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const body = createSchema.parse(await req.json());

  const folio = await nextSerieFolio(supabase, orgId, COUNT_DOC_TYPE);

  const { data: count, error } = await supabase
    .from('inventory_counts')
    .insert({
      organization_id: orgId,
      folio,
      warehouse_id: body.warehouseId,
      status: 'borrador',
      notas: body.notas ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  // Snapshot de existencias: system_qty = stock actual en `inventory` del almacén.
  let inv = supabase
    .from('inventory')
    .select('product_variant_id, stock')
    .eq('warehouse_id', body.warehouseId);
  if (body.variantIds && body.variantIds.length) {
    inv = inv.in('product_variant_id', body.variantIds);
  }
  const { data: invRows, error: invErr } = await inv;
  if (invErr) throw new ApiError(400, invErr.message);

  const stockByVariant = new Map<string, number>();
  for (const r of invRows ?? []) stockByVariant.set(r.product_variant_id, Number(r.stock));

  // Con variantIds explícitas: se siembran todas (aunque no tengan fila de
  // inventory ⇒ system_qty 0). Sin variantIds: TODO el inventario del almacén.
  const variantIds = [
    ...new Set(
      body.variantIds && body.variantIds.length
        ? body.variantIds
        : (invRows ?? []).map((r) => r.product_variant_id),
    ),
  ];

  if (variantIds.length) {
    const itemRows: TablesInsert<'inventory_count_items'>[] = variantIds.map((vid) => ({
      count_id: count.id,
      organization_id: orgId,
      product_variant_id: vid,
      system_qty: stockByVariant.get(vid) ?? 0,
      counted_qty: null,
    }));
    const { error: itemsErr } = await supabase.from('inventory_count_items').insert(itemRows);
    if (itemsErr) throw new ApiError(400, itemsErr.message);
  }

  return ok({ ok: true, id: count.id }, { status: 201 });
});
