/**
 * Cliente fetch del submódulo FACTURACIÓN (F1 Tanda B). Wrappers sobre
 * /api/erp/invoices/*. Mismo estilo que _lib/api.ts; tipos del contrato del
 * orquestador (solo se importan).
 */

import type { Paginated, ListParams } from '@/lib/types/erp';
import type {
  InvoiceRow,
  InvoiceDetail,
  DocLineInput,
  MetodoPago,
  CxcRow,
} from '@/lib/types/erp-ventas';
import { ApiError } from './api';

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
    throw new ApiError(0, 'No se pudo contactar el servidor');
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
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

export interface NewInvoiceBody {
  customerId: string;
  metodoPago: MetodoPago;
  formaPago?: string;
  usoCfdi?: string;
  serie?: string;
  lines: DocLineInput[];
}

// ===== Facturas =====

export const listInvoices = (p?: ListParams) =>
  request<Paginated<InvoiceRow>>(`/invoices${query(p)}`);

export const getInvoice = (id: string) => request<InvoiceDetail>(`/invoices/${id}`);

export const createInvoice = (body: NewInvoiceBody) =>
  request<{ ok: true; id: string }>('/invoices', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const timbrarInvoice = (id: string) =>
  request<InvoiceDetail>(`/invoices/${id}/timbrar`, { method: 'POST' });

export const pagarInvoice = (id: string, body: { monto: number; formaPago: string }) =>
  request<InvoiceDetail>(`/invoices/${id}/pago`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const cancelarInvoice = (id: string, motivo: string) =>
  request<InvoiceDetail>(`/invoices/${id}/cancelar`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });

// ===== Cuentas por cobrar =====

export const getCxc = () => request<CxcRow[]>('/invoices/cxc');
