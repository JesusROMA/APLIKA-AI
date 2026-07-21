/**
 * CONTRATO F2 — Tipos compartidos de Inventario. Ver docs/erp/F2-CONTRATOS.md §C2.
 * PROPIEDAD DEL ORQUESTADOR: los subagentes de la Tanda B (movimientos/conteos/
 * traspasos) importan de aquí; NO editan este archivo.
 */

// ===== Enums espejo de la BD =====
export type MovementType = 'entrada' | 'salida' | 'ajuste';
export type CountStatus = 'borrador' | 'en_conteo' | 'aplicado' | 'cancelada';
export type TransferStatus = 'borrador' | 'en_transito' | 'recibido' | 'cancelada';

// ===== Existencias / valuación =====

export interface StockRow {
  variantId: string;
  sku: string;
  name: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  stock: number;
  avgCost: number;
  value: number; // stock * avgCost
  minStock: number;
  maxStock: number;
}

export interface ValuationRow {
  warehouseId: string;
  warehouseName: string;
  skuCount: number; // variantes con existencia
  units: number; // Σ stock
  value: number; // Σ stock * avgCost
}

// ===== Kardex =====

export interface KardexRow {
  id: string;
  date: string;
  type: MovementType;
  qty: number; // con signo (+entrada / −salida)
  unitCost: number | null;
  avgCostAfter: number | null;
  balanceAfter: number | null;
  reason: string | null;
  refType: string | null;
}

/**
 * Alta de movimiento manual. `qty` es la magnitud capturada; el servidor deriva
 * el signo por `type` (entrada +, salida −). Para 'ajuste' se admite `qty`
 * negativa (merma) o positiva (sobrante).
 */
export interface MovementInput {
  productVariantId: string;
  warehouseId: string;
  type: MovementType;
  qty: number;
  unitCost?: number; // requerido/recomendado en entradas para el costeo promedio
  reason?: string;
}

// ===== Conteos físicos =====

export interface CountRow {
  id: string;
  folio: string;
  warehouseId: string;
  warehouseName: string | null;
  status: CountStatus;
  createdAt: string;
  appliedAt: string | null;
  itemCount: number;
}

export interface CountItem {
  id: string;
  productVariantId: string;
  sku: string | null;
  name: string;
  systemQty: number; // snapshot del stock al capturar
  countedQty: number | null; // null = pendiente de contar
  diff: number | null; // countedQty − systemQty (si contado)
}

export interface CountDetail extends CountRow {
  notas: string | null;
  items: CountItem[];
}

export interface CountItemInput {
  productVariantId: string;
  countedQty?: number | null;
}

// ===== Traspasos entre almacenes =====

export interface TransferItem {
  id: string;
  productVariantId: string;
  sku: string | null;
  name: string;
  qty: number;
  unitCost: number | null; // costo capturado al enviar
}

export interface TransferRow {
  id: string;
  folio: string;
  fromWarehouseId: string;
  fromWarehouseName: string | null;
  toWarehouseId: string;
  toWarehouseName: string | null;
  status: TransferStatus;
  createdAt: string;
  shippedAt: string | null;
  receivedAt: string | null;
  itemCount: number;
}

export interface TransferDetail extends TransferRow {
  notas: string | null;
  items: TransferItem[];
}

export interface TransferItemInput {
  productVariantId: string;
  qty: number;
}
