/**
 * Piezas compartidas del submódulo CUENTAS POR PAGAR (AGENTE-CXP, F5 Tanda B).
 * Selects + mappers a camelCase + cargador de detalle reutilizado por los
 * endpoints de detalle / pago / cancelar. Espejo de `/api/erp/invoices/**`
 * (CxC). Fichero `_`-prefijo ⇒ no genera ruta.
 *
 * NOTA de esquema: `supplier_invoices` NO tiene tabla de partidas. Las `lines`
 * del alta solo sirven para calcular subtotal/tax/total en el servidor; se
 * descartan tras el cálculo (solo se guarda la cabecera).
 */

import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import type {
  SupplierInvoiceRow,
  SupplierInvoiceDetail,
  SupplierInvoicePaymentRow,
  SupplierInvoiceStatus,
} from '@/lib/types/erp-compras';

// ===== Selects =====

export const LIST_SELECT =
  'id, folio, uuid, supplier_id, purchase_order_id, fecha, subtotal, tax, total, saldo, status, metodo_pago, forma_pago, created_at, suppliers ( name )';

export const DETAIL_SELECT = `id, folio, uuid, supplier_id, purchase_order_id, fecha, subtotal, tax, total, saldo, status, metodo_pago, forma_pago, created_at,
  suppliers ( name ),
  supplier_invoice_payments ( id, fecha, monto, forma_pago )`;

// ===== Formas crudas (cast tras la query, patrón del codebase) =====

export interface RawSupplierInvoiceHeader {
  id: string;
  folio: string;
  uuid: string | null;
  supplier_id: string;
  purchase_order_id: string | null;
  fecha: string;
  subtotal: number;
  tax: number;
  total: number;
  saldo: number | null;
  status: SupplierInvoiceStatus;
  metodo_pago: string | null;
  forma_pago: string | null;
  created_at: string;
  suppliers: { name: string } | null;
}

interface RawSupplierInvoicePayment {
  id: string;
  fecha: string;
  monto: number;
  forma_pago: string;
}

export interface RawSupplierInvoiceDetail extends RawSupplierInvoiceHeader {
  supplier_invoice_payments: RawSupplierInvoicePayment[];
}

// ===== Mappers =====

export function toSupplierInvoiceRow(r: RawSupplierInvoiceHeader): SupplierInvoiceRow {
  return {
    id: r.id,
    folio: r.folio,
    uuid: r.uuid,
    supplierId: r.supplier_id,
    supplierName: r.suppliers?.name ?? null,
    purchaseOrderId: r.purchase_order_id,
    fecha: r.fecha,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    saldo: r.saldo === null ? null : Number(r.saldo),
    status: r.status,
    metodoPago: r.metodo_pago,
    formaPago: r.forma_pago,
    createdAt: r.created_at,
  };
}

function toPaymentRow(p: RawSupplierInvoicePayment): SupplierInvoicePaymentRow {
  return {
    id: p.id,
    fecha: p.fecha,
    monto: Number(p.monto),
    formaPago: p.forma_pago,
  };
}

export function toSupplierInvoiceDetail(r: RawSupplierInvoiceDetail): SupplierInvoiceDetail {
  const payments = (r.supplier_invoice_payments ?? [])
    .map(toPaymentRow)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { ...toSupplierInvoiceRow(r), payments };
}

/** Carga el detalle completo de una factura de proveedor o lanza 404. */
export async function loadSupplierInvoiceDetail(
  supabase: ErpClient,
  id: string,
): Promise<SupplierInvoiceDetail> {
  const { data, error } = await supabase
    .from('supplier_invoices')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Factura de proveedor no encontrada');
  return toSupplierInvoiceDetail(data as unknown as RawSupplierInvoiceDetail);
}

// ===== Totales (en servidor) =====

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface InvoiceLineInput {
  name: string;
  qty: number;
  unitCost: number;
  ivaRate?: number;
}

/**
 * Calcula subtotal / tax / total a partir de las partidas del alta. Las líneas
 * son informativas (no se persisten): solo alimentan la cabecera.
 * `line_total = round(qty * unitCost, 2)`; IVA por línea = `round(line * iva, 2)`.
 */
export function computeInvoiceTotals(lines: InvoiceLineInput[]): {
  subtotal: number;
  tax: number;
  total: number;
} {
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const lineTotal = round2(l.qty * l.unitCost);
    subtotal += lineTotal;
    tax += round2(lineTotal * (l.ivaRate ?? 0));
  }
  subtotal = round2(subtotal);
  tax = round2(tax);
  return { subtotal, tax, total: round2(subtotal + tax) };
}
