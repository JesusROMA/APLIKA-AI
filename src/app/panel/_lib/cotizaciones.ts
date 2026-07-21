/**
 * Cliente fetch del submódulo Cotizaciones (F1 · Tanda B). Wrappers tipados a
 * /api/erp/quotes/*, mismo estilo que _lib/api.ts / _lib/ventas-api.ts (reusa
 * `ApiError` de ./api). El servidor es la autoridad; esto sólo transporta.
 */

import type { ListParams, Paginated } from '@/lib/types/erp';
import type { DocLineInput, QuoteDetail, QuoteRow } from '@/lib/types/erp-ventas';
import { ApiError } from './api';

const BASE = '/api/erp/quotes';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
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

/** Cuerpo de alta/edición de cotización (cabecera + partidas). */
export interface QuoteInput {
  customerId?: string | null;
  vigenciaDias?: number;
  descuentoGlobalPct?: number;
  notas?: string;
  lines: DocLineInput[];
}

export const listQuotes = (p?: ListParams) => req<Paginated<QuoteRow>>(`${query(p)}`);

export const getQuote = (id: string) => req<QuoteDetail>(`/${id}`);

export const createQuote = (body: QuoteInput) =>
  req<{ ok: boolean; id: string }>('', { method: 'POST', body: JSON.stringify(body) });

export const updateQuote = (id: string, body: QuoteInput) =>
  req<QuoteDetail>(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const enviarQuote = (id: string) => req<QuoteDetail>(`/${id}/enviar`, { method: 'POST' });

export const aceptarQuote = (id: string) => req<QuoteDetail>(`/${id}/aceptar`, { method: 'POST' });

export const rechazarQuote = (id: string, motivo?: string) =>
  req<QuoteDetail>(`/${id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) });

export const duplicarQuote = (id: string) =>
  req<{ id: string }>(`/${id}/duplicar`, { method: 'POST' });
