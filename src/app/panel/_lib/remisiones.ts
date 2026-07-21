/**
 * Cliente fetch del submódulo Remisiones (venta de mostrador). Wrappers delgados
 * sobre /api/erp/sales-notes/* con credenciales same-origin, al estilo de
 * `_lib/api.ts` y `_lib/ventas-api.ts`. Tipa contra el contrato de Ventas.
 */

import type { ListParams, Paginated } from '@/lib/types/erp';
import type {
  DocLineInput,
  SalesNoteRow,
  SalesNoteDetail,
  CorteDelDiaRow,
} from '@/lib/types/erp-ventas';
import { ApiError } from '@/app/panel/_lib/api';

const BASE = '/api/erp/sales-notes';

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
      /* respuesta sin JSON */
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

/** Cuerpo de alta/edición de remisión. */
export interface SalesNoteInput {
  customerId?: string | null;
  warehouseId?: string | null;
  lines: DocLineInput[];
}

export const listSalesNotes = (p?: ListParams) =>
  req<Paginated<SalesNoteRow>>(`${query(p)}`);

export const getSalesNote = (id: string) => req<SalesNoteDetail>(`/${id}`);

export const createSalesNote = (body: SalesNoteInput) =>
  req<{ ok: true; id: string }>('', { method: 'POST', body: JSON.stringify(body) });

export const updateSalesNote = (id: string, body: Partial<SalesNoteInput>) =>
  req<SalesNoteDetail>(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

/** Cobra la remisión (aplica inventario y pasa a 'cobrada'). */
export const cobrarSalesNote = (id: string, method: string) =>
  req<SalesNoteDetail>(`/${id}/cobrar`, { method: 'POST', body: JSON.stringify({ method }) });

/** Cancela (soft) una remisión abierta. */
export const cancelarSalesNote = (id: string, motivo: string) =>
  req<SalesNoteDetail>(`/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) });

/** Corte del día: remisiones cobradas de la fecha agregadas por forma de pago. */
export const getCorteDelDia = (date?: string) =>
  req<CorteDelDiaRow[]>(`/corte${date ? `?date=${date}` : ''}`);
