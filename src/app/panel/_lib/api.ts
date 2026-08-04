/**
 * Cliente fetch tipado del panel ERP (AGENTE-UI).
 *
 * Wrapper delgado sobre `fetch` a /api/erp/* con credenciales same-origin.
 * Todo se tipa contra src/lib/types/erp.ts (contrato del orquestador; sólo se
 * importa). Los endpoints los construye AGENTE-BACKEND en paralelo: si aún no
 * existen, estas funciones simplemente rechazan (ApiError) y las páginas
 * degradan a estado de error/carga en runtime. Nada de esto rompe el build.
 */

import type {
  SessionInfo,
  DashboardData,
  Paginated,
  ListParams,
  CustomerRow,
  ProductRow,
  WarehouseRow,
  PriceListRow,
  PriceListItemRow,
  SatCatalogEntry,
} from '@/lib/types/erp';
import type { CustomFieldDef } from '@/lib/types/erp-config';

/** Error de API con status HTTP para que la UI distinga 401 / 403 / 4xx. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Forma esperada de GET /api/erp/catalogs (catálogos SAT para los selects de
 * maestros). NOTA / SUPUESTO (reportado al orquestador): este endpoint no está
 * en la tabla C3 del contrato; se asume esta forma. Si AGENTE-BACKEND devuelve
 * otra, se ajusta aquí en un único lugar.
 */
export interface CatalogsResponse {
  regimenFiscal: SatCatalogEntry[];
  usoCfdi: SatCatalogEntry[];
  claveUnidad: SatCatalogEntry[];
}

const BASE = '/api/erp';

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    /* respuesta sin JSON */
  }
  return `Error ${res.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    // Red caída / endpoint inexistente todavía.
    throw new ApiError(0, 'No se pudo contactar el servidor');
  }
  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function query(params?: ListParams): string {
  if (!params) return '';
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.search) q.set('search', params.search);
  if (params.status) q.set('status', params.status);
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ===== Sesión / dashboard =====

export const getMe = () => request<SessionInfo>('/me');
export const getDashboard = () => request<DashboardData>('/dashboard');
export const getCatalogs = () => request<CatalogsResponse>('/catalogs');

// ===== Campos personalizados (F4) — defs activas para formularios =====
export const getCustomFields = (moduleKey = 'maestros') =>
  request<{ data: CustomFieldDef[] }>(`/custom-fields?moduleKey=${moduleKey}`).then((r) => r.data);

// ===== Clientes =====

export const listCustomers = (p?: ListParams) =>
  request<Paginated<CustomerRow>>(`/customers${query(p)}`);
export const getCustomer = (id: string) => request<CustomerRow>(`/customers/${id}`);
export const createCustomer = (body: Partial<CustomerRow>) =>
  request<CustomerRow>('/customers', { method: 'POST', body: JSON.stringify(body) });
export const updateCustomer = (id: string, body: Partial<CustomerRow>) =>
  request<CustomerRow>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// ===== Productos =====

export const listProducts = (p?: ListParams) =>
  request<Paginated<ProductRow>>(`/products${query(p)}`);
export const getProduct = (id: string) => request<ProductRow>(`/products/${id}`);
export const createProduct = (body: Partial<ProductRow>) =>
  request<ProductRow>('/products', { method: 'POST', body: JSON.stringify(body) });
export const updateProduct = (id: string, body: Partial<ProductRow>) =>
  request<ProductRow>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// ===== Almacenes =====

export const listWarehouses = (p?: ListParams) =>
  request<Paginated<WarehouseRow>>(`/warehouses${query(p)}`);
export const createWarehouse = (body: Partial<WarehouseRow>) =>
  request<WarehouseRow>('/warehouses', { method: 'POST', body: JSON.stringify(body) });
export const updateWarehouse = (id: string, body: Partial<WarehouseRow>) =>
  request<WarehouseRow>(`/warehouses/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// ===== Listas de precios =====

export const listPriceLists = (p?: ListParams) =>
  request<Paginated<PriceListRow>>(`/price-lists${query(p)}`);
export const createPriceList = (body: Partial<PriceListRow>) =>
  request<PriceListRow>('/price-lists', { method: 'POST', body: JSON.stringify(body) });
export const getPriceListItems = (id: string) =>
  request<PriceListItemRow[]>(`/price-lists/${id}/items`);
/** PUT: reemplazo real de los items de la lista (agrega/actualiza/elimina). */
export const putPriceListItems = (
  id: string,
  items: { productVariantId: string; priceMxn: number }[],
) =>
  request<{ ok: boolean; count: number }>(`/price-lists/${id}/items`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
