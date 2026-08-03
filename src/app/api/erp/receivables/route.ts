import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { buildLines, computeTotals } from '@/lib/erp/documents';
import { nextSerieFolio } from '@/lib/erp/folios';
import type { InvoiceStatus } from '@/lib/types/erp-ventas';
import { LIST_SELECT, toInvoiceRow, type RawInvoiceHeader } from './_shared';

export const dynamic = 'force-dynamic';

const DB_STATUSES = new Set<InvoiceStatus>([
  'borrador',
  'timbrada',
  'pagada',
  'pago_parcial',
  'cancelada',
]);

// GET /api/erp/receivables — Cuentas por cobrar: listado paginado
// (facturacion/ver). Por defecto muestra facturas VIVAS por cobrar (saldo > 0 en
// status timbrada/pago_parcial). Con `status` en la query lista TODAS las de ese
// estado. Filtro por folio de serie o por nombre de cliente.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('invoices').select(LIST_SELECT, { count: 'exact' });

  if (status && DB_STATUSES.has(status as InvoiceStatus)) {
    q = q.eq('status', status as InvoiceStatus);
  } else {
    // Cuentas por cobrar vivas: saldo pendiente y factura cobrable.
    q = q.gt('saldo', 0).in('status', ['timbrada', 'pago_parcial']);
  }

  if (search) {
    // Sanitiza caracteres que rompen la sintaxis de PostgREST `.or()`.
    const term = search.replace(/[,()]/g, ' ').trim();
    if (term) {
      const orParts = [`folio.ilike.%${term}%`, `uuid.ilike.%${term}%`];
      const { data: custs } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', `%${term}%`)
        .limit(50);
      const ids = (custs ?? []).map((c) => c.id);
      if (ids.length) orParts.push(`customer_id.in.(${ids.join(',')})`);
      q = q.or(orParts.join(','));
    }
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as RawInvoiceHeader[]).map(toInvoiceRow);
  return ok(paginated(rows, page, pageSize, count));
});

const LineInput = z
  .object({
    productVariantId: z.string().uuid().nullable().optional(),
    sku: z.string().nullable().optional(),
    name: z.string().optional(),
    qty: z.number().positive(),
    unitPrice: z.number().nonnegative().optional(),
    discountPct: z.number().min(0).max(100).optional(),
    ivaRate: z.number().min(0).max(1).optional(),
  })
  .refine((l) => Boolean(l.productVariantId) || Boolean(l.name && l.name.trim()), {
    message: 'Cada partida requiere producto o descripción',
  });

const NewReceivable = z.object({
  customerId: z.string().uuid(),
  metodoPago: z.enum(['PUE', 'PPD']).default('PUE'),
  formaPago: z.string().trim().optional(),
  lines: z.array(LineInput).min(1, 'La factura necesita al menos una partida'),
});

// POST /api/erp/receivables — registrar factura manual (facturacion/crear).
// Misma dinámica que el alta de CxP pero para factura de cliente: totales y
// folio SIEMPRE en servidor. Se registra en status 'timbrada' (cuenta por cobrar
// viva) con saldo = total y serie 'A'; toma régimen/uso CFDI del cliente.
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const b = NewReceivable.parse(await req.json());

  // Régimen / uso CFDI del cliente para la cabecera fiscal.
  const { data: cust } = await supabase
    .from('customers')
    .select('regimen_code, uso_cfdi_code')
    .eq('id', b.customerId)
    .maybeSingle();

  // Folio de factura por SERIE configurable (Config → Folios): 'FAC-A-0001'.
  const folio = await nextSerieFolio(supabase, orgId, 'invoice');

  const lines = await buildLines(supabase, b.customerId, b.lines);
  const totals = computeTotals(lines, 0);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      organization_id: orgId,
      customer_id: b.customerId,
      status: 'timbrada',
      serie: 'A',
      folio,
      metodo_pago: b.metodoPago,
      forma_pago: b.formaPago ?? null,
      uso_cfdi: cust?.uso_cfdi_code ?? null,
      regimen: cust?.regimen_code ?? null,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      saldo: totals.total,
      timbrada_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  const { error: itemsErr } = await supabase.from('invoice_items').insert(
    lines.map((l) => ({
      organization_id: orgId,
      invoice_id: invoice.id,
      product_variant_id: l.productVariantId,
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      unit_price: l.unitPrice,
      discount_pct: l.discountPct,
      iva_rate: l.ivaRate,
      line_total: l.lineTotal,
    })),
  );
  if (itemsErr) throw new ApiError(400, itemsErr.message);

  return ok({ ok: true, id: invoice.id }, { status: 201 });
});
