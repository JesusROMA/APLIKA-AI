/**
 * CONTRATO F1 — Tipos compartidos de Ventas (quote-to-cash).
 * Ver docs/erp/F1-CONTRATOS.md §C2. PROPIEDAD DEL ORQUESTADOR: los subagentes
 * de la Tanda B (cotizaciones/pedidos/remisiones/facturación) importan de aquí;
 * NO editan este archivo. Cambios de contrato → reportar al orquestador.
 */

import type { SatCatalogEntry } from '@/lib/types/erp';

// ===== Enums espejo de la BD =====

export type DocType = 'quote' | 'order' | 'invoice';

export type QuoteStatus = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida';
/** order_status con el estado lateral 'surtido_parcial' de F1. */
export type OrderStatus =
  | 'borrador'
  | 'confirmado'
  | 'pagado'
  | 'surtido_parcial'
  | 'surtido'
  | 'facturado'
  | 'enviado'
  | 'cancelada';
export type InvoiceStatus =
  | 'borrador'
  | 'timbrada'
  | 'pagada'
  | 'pago_parcial'
  | 'cancelada';

/** SAT c_MetodoPago. */
export type MetodoPago = 'PUE' | 'PPD';

// ===== Partida compartida (cotización/pedido/remisión/factura) =====

/**
 * Partida ya calculada que devuelven los endpoints. `lineTotal` = importe con
 * descuento de partida aplicado (antes de descuento global y de IVA); ver C1.8.
 */
export interface DocLine {
  id?: string;
  productVariantId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  discountPct: number; // 0..100, descuento de la partida
  ivaRate: number; // 0.160 default
  lineTotal: number;
  /** Solo pedidos: cantidad entregada acumulada (F1 entregas parciales). */
  qtyDelivered?: number;
}

/**
 * Partida de ENTRADA (crear/editar documento). El servidor resuelve `unitPrice`
 * desde la lista del cliente si se omite, y recalcula `lineTotal`/totales.
 */
export interface DocLineInput {
  productVariantId?: string | null;
  sku?: string | null;
  name?: string; // requerido si no hay variante (línea libre)
  qty: number;
  unitPrice?: number;
  discountPct?: number;
  ivaRate?: number;
}

/** Totales de documento calculados en servidor (C1.8). */
export interface DocTotals {
  subtotal: number; // Σ lineTotal
  descuento: number; // descuento global en MXN
  tax: number; // Σ IVA por partida (sobre base con descuento global prorrateado)
  total: number; // subtotal - descuento + tax
}

// ===== Cotizaciones =====

export interface QuoteRow {
  id: string;
  folio: string;
  customerId: string | null;
  customerName: string | null;
  status: QuoteStatus;
  vigenciaDias: number;
  validUntil: string | null;
  version: number;
  parentQuoteId: string | null;
  descuentoGlobalPct: number;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
}

export interface QuoteDetail extends QuoteRow {
  notas: string | null;
  custom: Record<string, unknown>;
  items: DocLine[];
  /** Documentos ligados (p.ej. el pedido generado). */
  links?: DocumentLink[];
}

// ===== Pedidos (namespace ERP) =====

export interface OrderRow {
  id: string;
  folio: string;
  customerId: string | null;
  customerName: string | null;
  status: OrderStatus;
  channel: string | null;
  subtotal: number;
  tax: number;
  total: number;
  itemsCount: number;
  createdAt: string;
}

export interface OrderDetail extends OrderRow {
  warehouseId: string | null;
  notes: string | null;
  stockApplied: boolean;
  items: DocLine[]; // cada partida incluye qtyDelivered
  links?: DocumentLink[];
}

/** Línea de una entrega (record_delivery). */
export interface DeliveryLineInput {
  itemId: string;
  qty: number;
}

// ===== Facturas + pagos (CxC / REP) =====

export interface InvoiceRow {
  id: string;
  serie: string;
  folio: string;
  uuid: string | null;
  customerId: string | null;
  customerName: string | null;
  status: InvoiceStatus;
  metodoPago: MetodoPago;
  formaPago: string | null;
  subtotal: number;
  tax: number;
  total: number;
  saldo: number | null;
  createdAt: string;
  timbradaAt: string | null;
}

export interface InvoicePaymentRow {
  id: string;
  fecha: string;
  monto: number;
  formaPago: string;
  isRep: boolean;
  uuidRep: string | null;
}

export interface InvoiceDetail extends InvoiceRow {
  regimen: string | null;
  usoCfdi: string | null;
  items: DocLine[];
  payments: InvoicePaymentRow[];
  links?: DocumentLink[];
}

/** Fila del reporte de Cuentas por Cobrar con antigüedad de saldo. */
export interface CxcRow {
  invoiceId: string;
  folio: string;
  customerId: string | null;
  customerName: string | null;
  total: number;
  saldo: number;
  daysOverdue: number;
  bucket: '0-30' | '31-60' | '61-90' | '90+';
}

// ===== Document flow (transversal) =====

export interface DocumentLink {
  id: string;
  srcType: DocType;
  srcId: string;
  dstType: DocType;
  dstId: string;
  createdAt: string;
}

/** Nodo de la cadena documental navegable (cotización→pedido→factura…). */
export interface DocFlowNode {
  type: DocType;
  id: string;
  folio: string;
  status: string;
  total: number;
}

export interface DocumentFlow {
  nodes: DocFlowNode[];
  edges: { from: string; to: string }[]; // ids "type:id"
}

// ===== Series de folio =====

export interface SeriesRow {
  id: string;
  docType: DocType;
  serie: string;
  prefix: string;
  nextValue: number;
  isDefault: boolean;
}

// ===== Catálogos SAT de Ventas (para selects de facturación) =====

export interface VentasCatalogs {
  formaPago: SatCatalogEntry[];
  metodoPago: SatCatalogEntry[];
}

// ===== Picker de variantes (fuente compartida de DocLinesEditor) =====

export interface VariantPick {
  id: string;
  sku: string;
  name: string;
  productName: string;
  /** Precio resuelto para el cliente indicado (lista o base). */
  price: number;
  ivaRate: number;
  stockTotal: number | null;
}
