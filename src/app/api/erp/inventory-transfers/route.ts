import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import type { TransferStatus } from '@/lib/types/erp-inventario';
import {
  createTransferSchema,
  itemInsertsFor,
  mapTransferRow,
  nextTransferFolio,
  warehouseNamesFor,
  type TransferHeaderRow,
} from './_shared';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, folio, from_warehouse_id, to_warehouse_id, status, created_at, shipped_at, received_at, inventory_transfer_items ( id )';

const DB_STATUSES = new Set<TransferStatus>(['borrador', 'en_transito', 'recibido', 'cancelada']);

// GET /api/erp/inventory-transfers — listado paginado (inventario/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('inventory_transfers').select(SELECT, { count: 'exact' });

  if (status && DB_STATUSES.has(status as TransferStatus)) {
    q = q.eq('status', status as TransferStatus);
  }

  // Búsqueda por folio o por nombre de almacén (origen/destino).
  if (search) {
    const { data: whs } = await supabase.from('warehouses').select('id').ilike('name', `%${search}%`);
    const whIds = (whs ?? []).map((w) => w.id);
    const ors = [`folio.ilike.%${search}%`];
    if (whIds.length) {
      ors.push(`from_warehouse_id.in.(${whIds.join(',')})`);
      ors.push(`to_warehouse_id.in.(${whIds.join(',')})`);
    }
    q = q.or(ors.join(','));
  }

  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;

  const rows = (data ?? []) as TransferHeaderRow[];
  const names = await warehouseNamesFor(
    supabase,
    rows.flatMap((r) => [r.from_warehouse_id, r.to_warehouse_id]),
  );
  return ok(paginated(rows.map((r) => mapTransferRow(r, names)), page, pageSize, count));
});

// POST /api/erp/inventory-transfers — alta en borrador (inventario/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'inventario', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const body = createTransferSchema.parse(await req.json());

  const folio = await nextTransferFolio(supabase, orgId);

  const { data: transfer, error } = await supabase
    .from('inventory_transfers')
    .insert({
      organization_id: orgId,
      folio,
      from_warehouse_id: body.fromWarehouseId,
      to_warehouse_id: body.toWarehouseId,
      status: 'borrador',
      notas: body.notas ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  const { error: itemsErr } = await supabase
    .from('inventory_transfer_items')
    .insert(itemInsertsFor(transfer.id, orgId, body.items));
  if (itemsErr) throw new ApiError(400, itemsErr.message);

  return ok({ ok: true, id: transfer.id }, { status: 201 });
});
