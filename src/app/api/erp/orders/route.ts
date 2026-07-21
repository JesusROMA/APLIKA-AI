import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { buildLines, computeTotals } from '@/lib/erp/documents';
import { nextSerieFolio } from '@/lib/erp/folios';
import type { OrderRow } from '@/lib/types/erp-ventas';
import { docLineInputSchema, assertLinesValid, orderItemRows, relName } from './_shared';

export const dynamic = 'force-dynamic';

const SELECT =
  'id, folio, customer_id, status, channel, subtotal, tax, total, items_count, created_at, customers ( name )';

interface OrderHeadRow {
  id: string;
  folio: string;
  customer_id: string | null;
  status: OrderRow['status'];
  channel: string | null;
  subtotal: number;
  tax: number;
  total: number;
  items_count: number;
  created_at: string;
  customers: unknown;
}

function toRow(o: OrderHeadRow): OrderRow {
  return {
    id: o.id,
    folio: o.folio,
    customerId: o.customer_id,
    customerName: relName(o.customers),
    status: o.status,
    channel: o.channel,
    subtotal: Number(o.subtotal),
    tax: Number(o.tax),
    total: Number(o.total),
    itemsCount: o.items_count,
    createdAt: o.created_at,
  };
}

// GET /api/erp/orders — listado paginado (ordenes/ver); filtra por folio/cliente y estado.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'ordenes', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('orders').select(SELECT, { count: 'exact' });

  if (search) {
    // "folio o cliente": resuelve los clientes que coinciden por nombre y filtra
    // por folio ilike OR customer_id in (…) en una sola consulta paginada.
    const { data: custs } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', `%${search}%`);
    const ids = (custs ?? []).map((c) => c.id);
    const parts = [`folio.ilike.%${search}%`];
    if (ids.length) parts.push(`customer_id.in.(${ids.join(',')})`);
    q = q.or(parts.join(','));
  }
  if (status) q = q.eq('status', status as OrderRow['status']);

  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;

  const rows = (data ?? []).map((o) => toRow(o as OrderHeadRow));
  return ok(paginated(rows, page, pageSize, count));
});

const NewOrder = z.object({
  customerId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  channel: z.string().trim().optional(),
  notes: z.string().optional(),
  lines: z.array(docLineInputSchema).min(1, 'El pedido requiere al menos una partida'),
});

// POST /api/erp/orders — alta (ordenes/crear). Folio + totales SIEMPRE en servidor.
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'ordenes', 'crear');
  const supabase = erpClientFor(session);
  const b = NewOrder.parse(await req.json());
  assertLinesValid(b.lines);

  const orgId = session.organization!.id;
  const folio = await nextSerieFolio(supabase, orgId, 'order');
  const lines = await buildLines(supabase, b.customerId ?? null, b.lines);
  const totals = computeTotals(lines, 0);

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      organization_id: orgId,
      folio,
      customer_id: b.customerId ?? null,
      warehouse_id: b.warehouseId ?? null,
      channel: b.channel ?? null,
      notes: b.notes ?? null,
      status: 'borrador',
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      items_count: lines.length,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  const { error: itemsErr } = await supabase
    .from('order_items')
    .insert(orderItemRows(lines, order.id, orgId));
  if (itemsErr) {
    // Sin transacción PostgREST: limpia la cabecera para no dejar un pedido vacío.
    await supabase.from('orders').delete().eq('id', order.id);
    throw new ApiError(400, itemsErr.message);
  }

  return ok({ ok: true, id: order.id }, { status: 201 });
});
