/**
 * CONTRATO F5 — Tipos compartidos de Compras y Proveedores. Ver
 * docs/erp/F5-CONTRATOS.md §C2. PROPIEDAD DEL ORQUESTADOR: los subagentes de la
 * Tanda B (proveedores/compras/cxp) importan de aquí; NO editan.
 */

export type PurchaseOrderStatus =
  | 'borrador'
  | 'confirmada'
  | 'recibida_parcial'
  | 'recibida'
  | 'cancelada';
export type SupplierInvoiceStatus =
  | 'borrador'
  | 'registrada'
  | 'pagada'
  | 'pago_parcial'
  | 'cancelada';

// ===== Proveedores (maestro) =====

export interface SupplierRow {
  id: string;
  name: string;
  rfc: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentDays: number;
  balance: number; // CxP: lo que les debemos
  active: boolean;
  custom: Record<string, unknown>;
  createdAt: string;
}

export interface SupplierInput {
  name: string;
  rfc?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentDays?: number;
  active?: boolean;
  custom?: Record<string, unknown>;
}

// ===== Órdenes de compra =====

export interface POLine {
  id?: string;
  productVariantId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  qtyReceived?: number;
  unitCost: number;
  ivaRate: number;
  lineTotal: number;
}

export interface POLineInput {
  productVariantId?: string | null;
  sku?: string | null;
  name?: string;
  qty: number;
  unitCost: number;
  ivaRate?: number;
}

export interface PurchaseOrderRow {
  id: string;
  folio: string;
  supplierId: string;
  supplierName: string | null;
  warehouseId: string | null;
  status: PurchaseOrderStatus;
  expectedDate: string | null;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
}

export interface PurchaseOrderDetail extends PurchaseOrderRow {
  notas: string | null;
  items: POLine[];
}

/** Línea de recepción (recibir_compra). */
export interface ReceiveLineInput {
  itemId: string;
  qty: number;
}

// ===== Facturas de proveedor / CxP =====

export interface SupplierInvoiceRow {
  id: string;
  folio: string; // folio del proveedor
  uuid: string | null;
  supplierId: string;
  supplierName: string | null;
  purchaseOrderId: string | null;
  fecha: string;
  subtotal: number;
  tax: number;
  total: number;
  saldo: number | null;
  status: SupplierInvoiceStatus;
  metodoPago: string | null;
  formaPago: string | null;
  createdAt: string;
}

export interface SupplierInvoicePaymentRow {
  id: string;
  fecha: string;
  monto: number;
  formaPago: string;
}

export interface SupplierInvoiceDetail extends SupplierInvoiceRow {
  payments: SupplierInvoicePaymentRow[];
}

/** Fila del reporte de Cuentas por Pagar con antigüedad de saldo. */
export interface CxpRow {
  invoiceId: string;
  folio: string;
  supplierId: string;
  supplierName: string | null;
  total: number;
  saldo: number;
  daysOverdue: number;
  bucket: '0-30' | '31-60' | '61-90' | '90+';
}

// ===== F6 · Requisiciones =====

export type RequisitionStatus =
  | 'borrador'
  | 'aprobada'
  | 'rechazada'
  | 'convertida'
  | 'cancelada';

export interface RequisitionItem {
  id?: string;
  productVariantId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  estimatedCost: number;
}

export interface RequisitionItemInput {
  productVariantId?: string | null;
  sku?: string | null;
  name?: string;
  qty: number;
  estimatedCost?: number;
}

export interface RequisitionRow {
  id: string;
  folio: string;
  status: RequisitionStatus;
  notas: string | null;
  itemCount: number;
  createdAt: string;
}

export interface RequisitionDetail extends RequisitionRow {
  items: RequisitionItem[];
  /** OC generada al convertir (trazabilidad). */
  purchaseOrderId?: string | null;
}

// ===== F6 · Órdenes de entrada (único camino de entrada de inventario) =====

export type EntryOrderStatus = 'borrador' | 'aplicada' | 'cancelada';
export type EntryOrigin = 'compra' | 'manual' | 'ajuste' | 'devolucion';

export interface EntryOrderItem {
  id?: string;
  purchaseOrderItemId: string | null;
  productVariantId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unitCost: number;
}

export interface EntryOrderItemInput {
  productVariantId?: string | null;
  sku?: string | null;
  name?: string;
  qty: number;
  unitCost: number;
  purchaseOrderItemId?: string | null;
}

export interface EntryOrderRow {
  id: string;
  folio: string;
  warehouseId: string;
  warehouseName: string | null;
  origin: EntryOrigin;
  purchaseOrderId: string | null;
  status: EntryOrderStatus;
  appliedAt: string | null;
  createdAt: string;
}

export interface EntryOrderDetail extends EntryOrderRow {
  notas: string | null;
  items: EntryOrderItem[];
}
