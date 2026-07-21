/**
 * Piezas compartidas del submódulo FACTURACIÓN (AGENTE-FACTURACIÓN, F1 Tanda B).
 * Selects + mappers a camelCase + cargador de detalle reutilizado por los
 * endpoints de detalle / timbrar / pago / cancelar. Privado al namespace
 * `/api/erp/invoices/**` (fichero `_`-prefijo ⇒ no genera ruta).
 */

import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import type {
  DocLine,
  InvoiceRow,
  InvoiceDetail,
  InvoicePaymentRow,
  MetodoPago,
  InvoiceStatus,
} from '@/lib/types/erp-ventas';

// ===== Selects =====

export const LIST_SELECT =
  'id, serie, folio, uuid, customer_id, status, metodo_pago, forma_pago, subtotal, tax, total, saldo, created_at, timbrada_at, customers ( name )';

export const DETAIL_SELECT = `id, serie, folio, uuid, customer_id, status, metodo_pago, forma_pago, subtotal, tax, total, saldo, regimen, uso_cfdi, created_at, timbrada_at,
  customers ( name ),
  invoice_items ( id, product_variant_id, sku, name, qty, unit_price, discount_pct, iva_rate, line_total ),
  invoice_payments ( id, fecha, monto, forma_pago, is_rep, uuid_rep ),
  invoice_sales_notes ( sales_note_id )`;

// ===== Formas crudas (cast tras la query, patrón del codebase) =====

export interface RawInvoiceHeader {
  id: string;
  serie: string;
  folio: string;
  uuid: string | null;
  customer_id: string | null;
  status: InvoiceStatus;
  metodo_pago: string | null;
  forma_pago: string | null;
  subtotal: number;
  tax: number;
  total: number;
  saldo: number | null;
  created_at: string;
  timbrada_at: string | null;
  customers: { name: string } | null;
}

interface RawInvoiceItem {
  id: string;
  product_variant_id: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  iva_rate: number;
  line_total: number;
}

interface RawInvoicePayment {
  id: string;
  fecha: string;
  monto: number;
  forma_pago: string;
  is_rep: boolean;
  uuid_rep: string | null;
}

export interface RawInvoiceDetail extends RawInvoiceHeader {
  regimen: string | null;
  uso_cfdi: string | null;
  invoice_items: RawInvoiceItem[];
  invoice_payments: RawInvoicePayment[];
  invoice_sales_notes: { sales_note_id: string }[];
}

// ===== Mappers =====

export function toInvoiceRow(r: RawInvoiceHeader): InvoiceRow {
  return {
    id: r.id,
    serie: r.serie,
    folio: r.folio,
    uuid: r.uuid,
    customerId: r.customer_id,
    customerName: r.customers?.name ?? null,
    status: r.status,
    metodoPago: (r.metodo_pago ?? 'PUE') as MetodoPago,
    formaPago: r.forma_pago,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    saldo: r.saldo === null ? null : Number(r.saldo),
    createdAt: r.created_at,
    timbradaAt: r.timbrada_at,
  };
}

function toDocLine(i: RawInvoiceItem): DocLine {
  return {
    id: i.id,
    productVariantId: i.product_variant_id,
    sku: i.sku,
    name: i.name,
    qty: Number(i.qty),
    unitPrice: Number(i.unit_price),
    discountPct: Number(i.discount_pct),
    ivaRate: Number(i.iva_rate),
    lineTotal: Number(i.line_total),
  };
}

function toPaymentRow(p: RawInvoicePayment): InvoicePaymentRow {
  return {
    id: p.id,
    fecha: p.fecha,
    monto: Number(p.monto),
    formaPago: p.forma_pago,
    isRep: p.is_rep,
    uuidRep: p.uuid_rep,
  };
}

export function toInvoiceDetail(r: RawInvoiceDetail): InvoiceDetail {
  const payments = (r.invoice_payments ?? [])
    .map(toPaymentRow)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    ...toInvoiceRow(r),
    regimen: r.regimen,
    usoCfdi: r.uso_cfdi,
    items: (r.invoice_items ?? []).map(toDocLine),
    payments,
    salesNoteIds: (r.invoice_sales_notes ?? []).map((s) => s.sales_note_id),
  };
}

/** Carga el detalle completo de una factura o lanza 404. Reutilizado por las acciones. */
export async function loadInvoiceDetail(supabase: ErpClient, id: string): Promise<InvoiceDetail> {
  const { data, error } = await supabase
    .from('invoices')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Factura no encontrada');
  return toInvoiceDetail(data as unknown as RawInvoiceDetail);
}
