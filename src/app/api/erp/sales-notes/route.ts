import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { buildLines, computeTotals } from '@/lib/erp/documents';
import { nextSerieFolio } from '@/lib/erp/folios';
import type { TablesInsert } from '@/lib/supabase/database.types';
import type { SalesNoteRow } from '@/lib/types/erp-ventas';
import { LIST_SELECT, LineInput, toRow } from './_shared';

export const dynamic = 'force-dynamic';

const STATUSES = ['abierta', 'cobrada', 'facturada', 'cancelada'] as const;
type Status = (typeof STATUSES)[number];

// GET /api/erp/sales-notes — listado paginado (remisiones/ver).
// Búsqueda por folio o nombre de cliente; filtro opcional por estado.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'remisiones', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('sales_notes').select(LIST_SELECT, { count: 'exact' });

  if (search) {
    const like = `%${search}%`;
    const orParts = [`folio.ilike.${like}`];
    // El nombre del cliente vive en la tabla embebida: resolvemos sus ids aparte
    // y los sumamos al OR (una consulta chica, robusta ante PostgREST).
    const { data: custs } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', like)
      .limit(50);
    const ids = (custs ?? []).map((c) => c.id);
    if (ids.length) orParts.push(`customer_id.in.(${ids.join(',')})`);
    q = q.or(orParts.join(','));
  }

  if (status && (STATUSES as readonly string[]).includes(status)) {
    q = q.eq('status', status as Status);
  }

  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;

  const rows = (data ?? []).map((r) => toRow(r as unknown as Parameters<typeof toRow>[0]));
  return ok(paginated<SalesNoteRow>(rows, page, pageSize, count));
});

const NewSalesNote = z.object({
  customerId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  lines: z.array(LineInput).min(1),
});

// POST /api/erp/sales-notes — alta de remisión (remisiones/crear).
// Venta de mostrador: cliente opcional (null ⇒ Público en general).
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'remisiones', 'crear');
  const supabase = erpClientFor(session);
  const b = NewSalesNote.parse(await req.json());

  const orgId = session.organization!.id;
  const folio = await nextSerieFolio(supabase, orgId, 'sales_note');
  const lines = await buildLines(supabase, b.customerId ?? null, b.lines);
  const totals = computeTotals(lines, 0);

  const noteInsert: TablesInsert<'sales_notes'> = {
    organization_id: orgId,
    folio,
    status: 'abierta',
    customer_id: b.customerId ?? null,
    warehouse_id: b.warehouseId ?? null,
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    created_by: session.userId,
  };

  const { data: note, error: noteErr } = await supabase
    .from('sales_notes')
    .insert(noteInsert)
    .select('id')
    .single();
  if (noteErr) throw new ApiError(400, noteErr.message);

  const itemsInsert: TablesInsert<'sales_note_items'>[] = lines.map((l) => ({
    sales_note_id: note.id,
    organization_id: orgId,
    product_variant_id: l.productVariantId,
    sku: l.sku,
    name: l.name,
    qty: l.qty,
    unit_price: l.unitPrice,
    discount_pct: l.discountPct,
    iva_rate: l.ivaRate,
    line_total: l.lineTotal,
  }));

  const { error: itemsErr } = await supabase.from('sales_note_items').insert(itemsInsert);
  if (itemsErr) {
    // Sin transacción vía PostgREST: revertimos la cabecera para no dejar huérfanos.
    await supabase.from('sales_notes').delete().eq('id', note.id);
    throw new ApiError(400, itemsErr.message);
  }

  return ok({ ok: true, id: note.id }, { status: 201 });
});
