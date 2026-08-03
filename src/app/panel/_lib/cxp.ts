/**
 * Cliente fetch del submódulo CUENTAS POR PAGAR (F5 · Compras). Wrappers a
 * `/api/erp/supplier-invoices/*`. Espejo de `_lib/facturacion.ts` (CxC). Tipos
 * del contrato del orquestador (solo se importan).
 */

import type { ListParams, Paginated } from '@/lib/types/erp';
import type {
  SupplierInvoiceRow,
  SupplierInvoiceDetail,
  SupplierRow,
  CxpRow,
} from '@/lib/types/erp-compras';
import { ApiError } from './api';

const BASE = '/api/erp';

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
    throw new ApiError(0, 'No se pudo contactar el servidor');
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b?.error) msg = b.error;
    } catch {
      /* sin JSON */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function query(p?: ListParams): string {
  const q = new URLSearchParams();
  if (p?.page) q.set('page', String(p.page));
  if (p?.pageSize) q.set('pageSize', String(p.pageSize));
  if (p?.search) q.set('search', p.search);
  if (p?.status) q.set('status', p.status);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export interface SupplierInvoiceLineInput {
  name: string;
  qty: number;
  unitCost: number;
  ivaRate?: number;
}

export interface NewSupplierInvoiceBody {
  supplierId: string;
  purchaseOrderId?: string | null;
  folio: string;
  uuid?: string;
  fecha?: string;
  metodoPago?: string;
  formaPago?: string;
  lines: SupplierInvoiceLineInput[];
}

// ===== Facturas de proveedor =====

export const listSupplierInvoices = (p?: ListParams) =>
  request<Paginated<SupplierInvoiceRow>>(`/supplier-invoices${query(p)}`);

export const getSupplierInvoice = (id: string) =>
  request<SupplierInvoiceDetail>(`/supplier-invoices/${id}`);

export const createSupplierInvoice = (body: NewSupplierInvoiceBody) =>
  request<{ ok: true; id: string }>('/supplier-invoices', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const pagarSupplierInvoice = (id: string, body: { monto: number; formaPago: string }) =>
  request<SupplierInvoiceDetail>(`/supplier-invoices/${id}/pago`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const cancelarSupplierInvoice = (id: string) =>
  request<SupplierInvoiceDetail>(`/supplier-invoices/${id}/cancelar`, {
    method: 'POST',
  });

// ===== Cuentas por pagar =====

export const getCxp = () => request<CxpRow[]>('/supplier-invoices/cxp');

// ===== Proveedores (selector del alta) =====

export const listSuppliers = (p?: ListParams) =>
  request<Paginated<SupplierRow>>(`/suppliers${query(p)}`);
