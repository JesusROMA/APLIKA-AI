import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import type { SupplierInvoiceStatus } from '@/lib/types/erp-compras';
import {
  LIST_SELECT,
  toSupplierInvoiceRow,
  computeInvoiceTotals,
  type RawSupplierInvoiceHeader,
} from './_shared';

export const dynamic = 'force-dynamic';

const DB_STATUSES = new Set<SupplierInvoiceStatus>([
  'borrador',
  'registrada',
  'pagada',
  'pago_parcial',
  'cancelada',
]);

// GET /api/erp/supplier-invoices — listado paginado (compras/ver). Filtro por
// folio del proveedor o por nombre de proveedor, y por status.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('supplier_invoices').select(LIST_SELECT, { count: 'exact' });

  if (status && DB_STATUSES.has(status as SupplierInvoiceStatus)) {
    q = q.eq('status', status as SupplierInvoiceStatus);
  }

  if (search) {
    const term = search.replace(/[,()]/g, ' ').trim();
    if (term) {
      const orParts = [`folio.ilike.%${term}%`, `uuid.ilike.%${term}%`];
      const { data: sups } = await supabase
        .from('suppliers')
        .select('id')
        .ilike('name', `%${term}%`)
        .limit(50);
      const ids = (sups ?? []).map((s) => s.id);
      if (ids.length) orParts.push(`supplier_id.in.(${ids.join(',')})`);
      q = q.or(orParts.join(','));
    }
  }

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as RawSupplierInvoiceHeader[]).map(toSupplierInvoiceRow);
  return ok(paginated(rows, page, pageSize, count));
});

const LineInput = z.object({
  name: z.string().trim().min(1, 'Cada partida requiere descripción'),
  qty: z.number().positive(),
  unitCost: z.number().nonnegative(),
  ivaRate: z.number().min(0).max(1).optional(),
});

const NewSupplierInvoice = z.object({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().nullable().optional(),
  folio: z.string().trim().min(1, 'El folio del proveedor es obligatorio'),
  uuid: z.string().trim().optional(),
  fecha: z.string().trim().optional(),
  metodoPago: z.string().trim().optional(),
  formaPago: z.string().trim().optional(),
  lines: z.array(LineInput).min(1, 'La factura necesita al menos una partida'),
});

// POST /api/erp/supplier-invoices — alta (compras/crear). Totales SIEMPRE en
// servidor; se registra en status 'registrada' con saldo = total. La CxP
// (suppliers.balance) la SUBE este endpoint (la BD solo la baja en el pago).
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const b = NewSupplierInvoice.parse(await req.json());

  const totals = computeInvoiceTotals(b.lines);

  const { data: invoice, error } = await supabase
    .from('supplier_invoices')
    .insert({
      organization_id: orgId,
      supplier_id: b.supplierId,
      purchase_order_id: b.purchaseOrderId ?? null,
      folio: b.folio,
      uuid: b.uuid ?? null,
      ...(b.fecha ? { fecha: b.fecha } : {}),
      metodo_pago: b.metodoPago ?? null,
      forma_pago: b.formaPago ?? null,
      status: 'registrada',
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      saldo: totals.total,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      throw new ApiError(409, 'Ya existe una factura con ese folio para el proveedor');
    }
    throw new ApiError(400, error.message);
  }

  // Sube la CxP: suppliers.balance += total (la BD no lo hace aquí).
  const { data: sup } = await supabase
    .from('suppliers')
    .select('balance')
    .eq('id', b.supplierId)
    .maybeSingle();
  const { error: balErr } = await supabase
    .from('suppliers')
    .update({ balance: Number(sup?.balance ?? 0) + totals.total })
    .eq('id', b.supplierId);
  if (balErr) throw new ApiError(400, balErr.message);

  return ok({ ok: true, id: invoice.id }, { status: 201 });
});
