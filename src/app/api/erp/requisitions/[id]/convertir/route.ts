import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { nextSerieFolio } from '@/lib/erp/folios';
import { round2 } from '@/lib/erp/totals';
import type { TablesInsert } from '@/lib/supabase/database.types';
import { convertReqSchema, convertNoteFor, loadReqDetail } from '../../_shared';

export const dynamic = 'force-dynamic';

const IVA = 0.16;

// POST /api/erp/requisitions/[id]/convertir — aprobada → OC en borrador (compras/crear)
export const POST = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const { supplierId } = convertReqSchema.parse(await req.json());

  // La requisición debe existir y estar aprobada.
  const detail = await loadReqDetail(supabase, params.id);
  if (detail.status !== 'aprobada') {
    throw new ApiError(409, 'Sólo se convierten requisiciones aprobadas');
  }

  // Totales de la OC usando el costo estimado como costo unitario (IVA 16%).
  const lines = detail.items.map((it) => {
    const lineTotal = round2(it.qty * it.estimatedCost);
    return {
      productVariantId: it.productVariantId,
      sku: it.sku,
      name: it.name,
      qty: it.qty,
      unitCost: it.estimatedCost,
      lineTotal,
    };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const tax = round2(lines.reduce((s, l) => s + round2(l.lineTotal * IVA), 0));
  const total = round2(subtotal + tax);

  const folio = await nextSerieFolio(supabase, orgId, 'purchase');

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({
      organization_id: orgId,
      folio,
      supplier_id: supplierId,
      status: 'borrador',
      subtotal,
      tax,
      total,
      notas: convertNoteFor(detail.folio),
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (poErr) throw new ApiError(400, poErr.message);

  const itemInserts: TablesInsert<'purchase_order_items'>[] = lines.map((l) => ({
    purchase_order_id: po.id,
    organization_id: orgId,
    product_variant_id: l.productVariantId,
    sku: l.sku,
    name: l.name,
    qty: l.qty,
    qty_received: 0,
    unit_cost: l.unitCost,
    iva_rate: IVA,
    line_total: l.lineTotal,
  }));

  const { error: itemsErr } = await supabase
    .from('purchase_order_items')
    .insert(itemInserts);
  if (itemsErr) throw new ApiError(400, itemsErr.message);

  // Marca la requisición como convertida.
  const { error: updErr } = await supabase
    .from('requisitions')
    .update({ status: 'convertida' })
    .eq('id', params.id);
  if (updErr) throw new ApiError(400, updErr.message);

  return ok({ ok: true, purchaseOrderId: po.id }, { status: 201 });
});
