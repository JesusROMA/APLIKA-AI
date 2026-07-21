import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { buildLines, computeTotals } from '@/lib/erp/documents';
import type { TablesInsert, TablesUpdate } from '@/lib/supabase/database.types';
import { LineInput, fetchDetail } from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/sales-notes/[id] — detalle (remisiones/ver).
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'remisiones', 'ver');
  const supabase = erpClientFor(session);

  const detail = await fetchDetail(supabase, params.id);
  if (!detail) throw new ApiError(404, 'Remisión no encontrada');
  return ok(detail);
});

const Patch = z.object({
  customerId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  lines: z.array(LineInput).min(1).optional(),
});

// PATCH /api/erp/sales-notes/[id] — edición SOLO en estado 'abierta' (rebuild).
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'remisiones', 'editar');
  const supabase = erpClientFor(session);
  const b = Patch.parse(await req.json());

  const { data: cur, error: curErr } = await supabase
    .from('sales_notes')
    .select('status, customer_id, organization_id')
    .eq('id', params.id)
    .maybeSingle();
  if (curErr) throw curErr;
  if (!cur) throw new ApiError(404, 'Remisión no encontrada');
  if (cur.status !== 'abierta') {
    throw new ApiError(409, 'Solo se puede editar una remisión abierta');
  }

  const update: TablesUpdate<'sales_notes'> = {};
  if (b.customerId !== undefined) update.customer_id = b.customerId;
  if (b.warehouseId !== undefined) update.warehouse_id = b.warehouseId;

  // Rebuild de partidas/totales cuando llegan líneas nuevas.
  if (b.lines) {
    const custForPricing = b.customerId !== undefined ? b.customerId : cur.customer_id;
    const lines = await buildLines(supabase, custForPricing, b.lines);
    const totals = computeTotals(lines, 0);
    update.subtotal = totals.subtotal;
    update.tax = totals.tax;
    update.total = totals.total;

    const { error: delErr } = await supabase
      .from('sales_note_items')
      .delete()
      .eq('sales_note_id', params.id);
    if (delErr) throw new ApiError(400, delErr.message);

    const itemsInsert: TablesInsert<'sales_note_items'>[] = lines.map((l) => ({
      sales_note_id: params.id,
      organization_id: cur.organization_id,
      product_variant_id: l.productVariantId,
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      unit_price: l.unitPrice,
      discount_pct: l.discountPct,
      iva_rate: l.ivaRate,
      line_total: l.lineTotal,
    }));
    const { error: insErr } = await supabase.from('sales_note_items').insert(itemsInsert);
    if (insErr) throw new ApiError(400, insErr.message);
  }

  if (Object.keys(update).length > 0) {
    const { error: updErr } = await supabase
      .from('sales_notes')
      .update(update)
      .eq('id', params.id);
    if (updErr) throw new ApiError(400, updErr.message);
  }

  const detail = await fetchDetail(supabase, params.id);
  if (!detail) throw new ApiError(404, 'Remisión no encontrada');
  return ok(detail);
});
