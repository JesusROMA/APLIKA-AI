/**
 * Cliente fetch del submódulo CUENTAS POR COBRAR (F7 · Facturación). Wrappers a
 * `/api/erp/receivables/*`. Misma dinámica que `_lib/cxp.ts` (CxP) pero sobre
 * facturas de cliente. Tipos del contrato del orquestador (solo se importan).
 */

import type { ListParams, Paginated } from '@/lib/types/erp';
import type {
  InvoiceRow,
  InvoiceDetail,
  DocLineInput,
  MetodoPago,
  CxcRow,
} from '@/lib/types/erp-ventas';
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

export interface NewReceivableBody {
  customerId: string;
  metodoPago: MetodoPago;
  formaPago?: string;
  lines: DocLineInput[];
}

/** Respuesta del reporte de antigüedad de saldos. */
export interface AgingReport {
  rows: CxcRow[];
  totals: {
    byBucket: Record<CxcRow['bucket'], number>;
    total: number;
  };
}

// ===== Facturas por cobrar =====

export const listReceivables = (p?: ListParams) =>
  request<Paginated<InvoiceRow>>(`/receivables${query(p)}`);

export const getReceivable = (id: string) =>
  request<InvoiceDetail>(`/receivables/${id}`);

export const createReceivable = (body: NewReceivableBody) =>
  request<{ ok: true; id: string }>('/receivables', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const pagarReceivable = (id: string, body: { monto: number; formaPago: string }) =>
  request<InvoiceDetail>(`/receivables/${id}/pago`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

// ===== Antigüedad de saldos =====

export const getAging = () => request<AgingReport>('/receivables/aging');
