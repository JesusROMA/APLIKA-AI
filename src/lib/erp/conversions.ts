import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import { linkDocs } from '@/lib/erp/documents';
import { nextSerieFolio } from '@/lib/erp/folios';
import type { SessionInfo } from '@/lib/types/erp';

/**
 * COSTURAS DE CONVERSIÓN entre documentos (C1.6 / Tanda C) — PROPIEDAD DEL
 * ORQUESTADOR. Los 4 submódulos NO ligan documentos ni crean documentos de otro
 * tipo; toda conversión pasa por aquí, que además registra el `document_link`.
 *
 * Principio: los TOTALES del documento destino se COPIAN del origen (o se suman,
 * en la factura global) para garantizar números idénticos a lo largo del flujo;
 * no se recalculan. Las partidas se copian tal cual. RLS + guardas del route son
 * la autoridad de permisos (el caller ya validó acceso al módulo destino).
 */

interface Totals {
  subtotal: number;
  tax: number;
  total: number;
}

/** Partida normalizada de origen (quote_items / sales_note_items). */
interface SrcItem {
  product_variant_id: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  iva_rate: number;
  line_total: number;
}

// ============================================================================
// Cotización → Pedido
// ============================================================================
export async function convertQuoteToOrder(
  supabase: ErpClient,
  session: SessionInfo,
  quoteId: string,
): Promise<string> {
  const orgId = session.organization!.id;

  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', quoteId)
    .maybeSingle();
  if (qErr) throw qErr;
  if (!quote) throw new ApiError(404, 'Cotización no encontrada');
  if (quote.status !== 'aceptada') {
    throw new ApiError(409, 'Solo se convierte a pedido una cotización aceptada');
  }

  await assertNotLinked(supabase, 'quote', quoteId, 'order', 'La cotización ya generó un pedido');

  const items = (quote.quote_items ?? []) as SrcItem[];
  if (items.length === 0) throw new ApiError(422, 'La cotización no tiene partidas');

  const folio = await nextSerieFolio(supabase, orgId, 'order');
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({
      organization_id: orgId,
      folio,
      customer_id: quote.customer_id,
      // F8: la salida de stock ocurre en el almacén elegido al cotizar.
      warehouse_id: quote.warehouse_id ?? null,
      status: 'borrador',
      channel: `Cotización ${quote.folio}`,
      subtotal: Number(quote.subtotal),
      tax: Number(quote.tax),
      total: Number(quote.total),
      items_count: items.length,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (oErr) throw new ApiError(400, oErr.message);

  // order_items NO persiste iva/descuento por partida (el total de cabecera es
  // la autoridad); qty es INTEGER ⇒ se redondea.
  const { error: iErr } = await supabase.from('order_items').insert(
    items.map((it) => ({
      organization_id: orgId,
      order_id: order.id,
      product_variant_id: it.product_variant_id,
      sku: it.sku,
      name: it.name,
      qty: Math.round(Number(it.qty)),
      unit_price: Number(it.unit_price),
      line_total: Number(it.line_total),
    })),
  );
  if (iErr) throw new ApiError(400, iErr.message);

  await linkDocs(supabase, { type: 'quote', id: quoteId }, { type: 'order', id: order.id });
  return order.id;
}

// ============================================================================
// Pedido → Factura
// ============================================================================
export async function convertOrderToInvoice(
  supabase: ErpClient,
  session: SessionInfo,
  orderId: string,
  opts: InvoiceOpts = {},
): Promise<string> {
  const orgId = session.organization!.id;

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!order) throw new ApiError(404, 'Pedido no encontrado');
  if (order.status === 'cancelada') throw new ApiError(409, 'El pedido está cancelado');
  if (!order.customer_id) throw new ApiError(422, 'El pedido no tiene cliente para facturar');

  await assertNotLinked(supabase, 'order', orderId, 'invoice', 'El pedido ya tiene factura');

  const orderItems = (order.order_items ?? []) as {
    product_variant_id: string | null;
    sku: string | null;
    name: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }[];
  if (orderItems.length === 0) throw new ApiError(422, 'El pedido no tiene partidas');

  // order_items no guarda iva por partida; se recupera del producto (mejor
  // esfuerzo, default 0.16). El total de la factura se copia del pedido.
  const ivaByVariant = await ivaRateByVariant(
    supabase,
    orderItems.map((i) => i.product_variant_id).filter((x): x is string => !!x),
  );
  const items: SrcItem[] = orderItems.map((it) => ({
    product_variant_id: it.product_variant_id,
    sku: it.sku,
    name: it.name,
    qty: Number(it.qty),
    unit_price: Number(it.unit_price),
    discount_pct: 0,
    iva_rate: it.product_variant_id ? ivaByVariant.get(it.product_variant_id) ?? 0.16 : 0.16,
    line_total: Number(it.line_total),
  }));

  const invoiceId = await createInvoice(supabase, session, {
    customerId: order.customer_id,
    items,
    totals: { subtotal: Number(order.subtotal), tax: Number(order.tax), total: Number(order.total) },
    orderId,
    ...opts,
  });

  await linkDocs(supabase, { type: 'order', id: orderId }, { type: 'invoice', id: invoiceId });
  return invoiceId;
}

// ============================================================================
// Helpers
// ============================================================================

export interface InvoiceOpts {
  metodoPago?: 'PUE' | 'PPD';
  formaPago?: string | null;
  serie?: string;
}

interface CreateInvoiceArgs extends InvoiceOpts {
  customerId: string;
  items: SrcItem[];
  totals: Totals;
  orderId?: string;
}

async function createInvoice(
  supabase: ErpClient,
  session: SessionInfo,
  args: CreateInvoiceArgs,
): Promise<string> {
  const orgId = session.organization!.id;
  const serie = args.serie ?? 'A';

  const { data: customer } = await supabase
    .from('customers')
    .select('regimen_code, uso_cfdi_code')
    .eq('id', args.customerId)
    .maybeSingle();

  const folio = await nextSerieFolio(supabase, orgId, 'invoice'); // 'FAC-A-0001'

  const { data: invoice, error: iErr } = await supabase
    .from('invoices')
    .insert({
      organization_id: orgId,
      order_id: args.orderId ?? null,
      customer_id: args.customerId,
      serie,
      folio,
      regimen: customer?.regimen_code ?? null,
      uso_cfdi: customer?.uso_cfdi_code ?? null,
      subtotal: args.totals.subtotal,
      tax: args.totals.tax,
      total: args.totals.total,
      saldo: args.totals.total,
      status: 'borrador',
      metodo_pago: args.metodoPago ?? 'PUE',
      forma_pago: args.formaPago ?? null,
    })
    .select('id')
    .single();
  if (iErr) throw new ApiError(400, iErr.message);

  const { error: itErr } = await supabase.from('invoice_items').insert(
    args.items.map((it) => ({
      organization_id: orgId,
      invoice_id: invoice.id,
      product_variant_id: it.product_variant_id,
      sku: it.sku,
      name: it.name,
      qty: it.qty,
      unit_price: it.unit_price,
      discount_pct: it.discount_pct,
      iva_rate: it.iva_rate,
      line_total: it.line_total,
    })),
  );
  if (itErr) throw new ApiError(400, itErr.message);

  return invoice.id;
}

/** 409 si ya existe un `document_link` src→dstType. */
async function assertNotLinked(
  supabase: ErpClient,
  srcType: string,
  srcId: string,
  dstType: string,
  message: string,
): Promise<void> {
  const { data } = await supabase
    .from('document_links')
    .select('dst_id')
    .eq('src_type', srcType)
    .eq('src_id', srcId)
    .eq('dst_type', dstType)
    .limit(1);
  if (data && data.length > 0) throw new ApiError(409, message);
}

/** IVA por variante (de su producto), para reconstruir partidas de factura. */
async function ivaRateByVariant(
  supabase: ErpClient,
  variantIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (variantIds.length === 0) return map;
  const { data } = await supabase
    .from('product_variants')
    .select('id, products ( iva_rate )')
    .in('id', variantIds);
  for (const v of data ?? []) {
    const prod = v.products as { iva_rate: number } | null;
    map.set(v.id, Number(prod?.iva_rate ?? 0.16));
  }
  return map;
}
