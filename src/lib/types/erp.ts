/**
 * CONTRATO F0 — Tipos compartidos del ERP (ver docs/erp/F0-CONTRATOS.md §C2).
 * PROPIEDAD DEL ORQUESTADOR: los subagentes importan de aquí; NO editan este
 * archivo. Cambios de contrato → reportar al orquestador.
 */

// ===== Módulos y permisos =====

/** Keys reales de la tabla `modules` + el módulo virtual 'maestros' (RBAC). */
export type ModuleKey =
  | 'dashboard'
  | 'ordenes'
  | 'cotizaciones' // F1 Ventas
  | 'inventario'
  | 'facturacion'
  | 'pagos'
  | 'crm'
  | 'calendario'
  | 'reservas_whatsapp'
  | 'ia_agente'
  | 'config'
  | 'maestros';

export type PermAction = 'ver' | 'crear' | 'editar' | 'cancelar' | 'configurar';

/** Espejo del enum `user_role` de la BD (F0 agrega 'tenant_viewer'). */
export type Role =
  | 'super_admin'
  | 'tenant_admin' // Dueño/Admin
  | 'tenant_user' // Operador
  | 'tenant_viewer' // Solo-lectura
  | 'customer';

/** perms[module][action] === true ⇒ permitido. La UI oculta; el server manda. */
export type PermissionMap = Partial<Record<ModuleKey, Partial<Record<PermAction, boolean>>>>;

// ===== Sesión =====

export interface SessionInfo {
  userId: string;
  email: string;
  fullName: string | null;
  role: Role;
  organization: {
    id: string;
    slug: string;
    name: string;
    vertical: string | null;
  } | null;
  /** Presente cuando un super_admin está impersonando un tenant (C1.3). */
  impersonating: { id: string; slug: string; name: string } | null;
  modules: { key: ModuleKey; label: string; icon: string; routePrefix: string }[];
  perms: PermissionMap;
}

// ===== Listados / paginación (obligatoria en todo listado ERP) =====

export interface ListParams {
  page?: number; // 1-based, default 1
  pageSize?: number; // default 25, máx 100
  search?: string;
  status?: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ===== Maestros =====

export interface CustomerRow {
  id: string;
  name: string;
  rfc: string | null;
  regimenCode: string | null; // SAT c_RegimenFiscal
  usoCfdiCode: string | null; // SAT c_UsoCFDI
  cp: string | null; // CP domicilio fiscal (CFDI 4.0)
  contactName: string | null;
  phone: string | null;
  email: string | null;
  priceListId: string | null;
  priceListName: string | null;
  creditLimit: number;
  creditDays: number;
  discountPct: number;
  balance: number;
  active: boolean;
  createdAt: string;
}

export interface VariantRow {
  id: string;
  sku: string;
  name: string | null;
  basePriceMxn: number;
  claveUnidad: string; // SAT c_ClaveUnidad
  attributes: Record<string, unknown>;
  /** Suma de stock en todos los almacenes (solo lectura, la arma el backend). */
  stockTotal: number | null;
}

export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  tipo: 'producto' | 'servicio';
  claveProdServ: string | null; // SAT c_ClaveProdServ
  ivaRate: number; // 0.160 default
  variants: VariantRow[];
  createdAt: string;
}

export interface WarehouseRow {
  id: string;
  name: string;
  code: string | null;
  isDefault: boolean;
}

export interface PriceListRow {
  id: string;
  name: string;
  isDefault: boolean;
  itemCount: number;
}

export interface PriceListItemRow {
  productVariantId: string;
  sku: string;
  productName: string;
  priceMxn: number;
}

// ===== Catálogos SAT (subset seed) =====

export interface SatCatalogEntry {
  code: string;
  label: string;
}

// ===== Dashboard =====

/** KPI limpio: la UI decide formato/estilo (sin strings pre-formateados). */
export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  unit: 'mxn' | 'count' | 'pct';
  trend?: { pct: number; direction: 'up' | 'down' | 'flat' };
}

export interface DashboardData {
  kpis: DashboardKpi[];
  salesTrend?: { date: string; total: number }[]; // solo si módulo ordenes
  stockAlerts?: { sku: string; name: string; stock: number; minStock: number }[];
  todayAppointments?: { id: string; startsAt: string; patientName: string; status: string }[];
}

// ===== Errores API =====

export interface ApiErrorBody {
  error: string;
}
