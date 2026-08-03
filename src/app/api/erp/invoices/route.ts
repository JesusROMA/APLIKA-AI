import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import { buildLines, computeTotals } from '@/lib/erp/documents';
import { nextSerieFolio } from '@/lib/erp/folios';
import { fetchVentasCatalogs } from '@/lib/erp/catalogs';
import type { InvoiceStatus } from '@/lib/types/erp-ventas';
import { LIST_SELECT, toInvoiceRow, type RawInvoiceHeader } from './_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/invoices — listado paginado (facturacion/ver). Filtro por
// serie-folio, uuid o nombre de cliente, y por status.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('invoices').select(LIST_SELECT, { count: 'exact' });

  if (status) q = q.eq('status', status as InvoiceStatus);

  if (search) {
    // Sanitiza caracteres que rompen la sintaxis de PostgREST `.or()`.
    const term = search.replace(/[,()]/g, ' ').trim();
    if (term) {
      const orParts = [`folio.ilike.%${term}%`, `uuid.ilike.%${term}%`];
      // "A-1042" → también compara contra el folio sin la serie.
      const dash = term.indexOf('-');
      if (dash > 0) orParts.push(`folio.ilike.%${term.slice(dash + 1)}%`);
      // Nombre de cliente → resolvemos ids y los sumamos al OR.
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

const NewInvoice = z.object({
  customerId: z.string().uuid(),
  metodoPago: z.enum(['PUE', 'PPD']).default('PUE'),
  formaPago: z.string().trim().optional(),
  usoCfdi: z.string().trim().optional(),
  serie: z.string().trim().min(1).default('A'),
  lines: z.array(LineInput).min(1, 'La factura necesita al menos una partida'),
});

// POST /api/erp/invoices — alta en borrador (facturacion/crear). Totales y folio
// SIEMPRE en servidor. Folio = next_folio(entero) + serie.
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const b = NewInvoice.parse(await req.json());

  // Valida forma_pago contra el catálogo SAT c_FormaPago si viene.
  if (b.formaPago) {
    const catalogs = await fetchVentasCatalogs(supabase);
    const valid = new Set(catalogs.formaPago.map((f) => f.code));
    if (!valid.has(b.formaPago)) {
      throw new ApiError(422, `Forma de pago SAT inválida: ${b.formaPago}`);
    }
  }

  // Régimen / uso CFDI del cliente (el body puede sobreescribir uso CFDI).
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
      status: 'borrador',
      serie: b.serie,
      folio,
      metodo_pago: b.metodoPago,
      forma_pago: b.formaPago ?? null,
      uso_cfdi: b.usoCfdi ?? cust?.uso_cfdi_code ?? null,
      regimen: cust?.regimen_code ?? null,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      saldo: totals.total,
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
