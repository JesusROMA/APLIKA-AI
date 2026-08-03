/**
 * Cliente fetch del submódulo ÓRDENES DE ENTRADA (namespace ERP
 * `/api/erp/entry-orders`). Propiedad de AGENTE-ENTRADAS. Wrapper delgado sobre
 * fetch, mismo estilo que `_lib/compras.ts`. Las órdenes de entrada son el ÚNICO
 * camino de entrada de inventario: se crean (manual o desde una OC) y se
 * "aplican" (postean al inventario con costo → costo promedio).
 */

import type { Paginated, ListParams } from '@/lib/types/erp';
import type {
  EntryOrderRow,
  EntryOrderDetail,
  EntryOrderStatus,
  EntryOrigin,
  EntryOrderItemInput,
} from '@/lib/types/erp-compras';
import { ApiError } from '@/app/panel/_lib/api';

const BASE = '/api/erp';

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

/** Params de listado de OE: paginación + búsqueda por folio + status/origin. */
export interface EntryListParams extends ListParams {
  origin?: EntryOrigin | '';
}

function query(params?: EntryListParams): string {
  if (!params) return '';
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.search) q.set('search', params.search);
  if (params.status) q.set('status', params.status);
  if (params.origin) q.set('origin', params.origin);
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ===== Órdenes de entrada =====

export interface NewEntryOrderInput {
  warehouseId: string;
  origin: EntryOrigin;
  purchaseOrderId?: string | null;
  notas?: string | null;
  items: EntryOrderItemInput[];
}

export interface UpdateEntryOrderInput {
  notas?: string | null;
  items?: EntryOrderItemInput[];
}

export const listEntryOrders = (p?: EntryListParams) =>
  req<Paginated<EntryOrderRow>>(`/entry-orders${query(p)}`);

export const getEntryOrder = (id: string) =>
  req<EntryOrderDetail>(`/entry-orders/${id}`);

export const createEntryOrder = (body: NewEntryOrderInput) =>
  req<{ ok: true; id: string }>('/entry-orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateEntryOrder = (id: string, body: UpdateEntryOrderInput) =>
  req<EntryOrderDetail>(`/entry-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const aplicarEntryOrder = (id: string) =>
  req<EntryOrderDetail>(`/entry-orders/${id}/aplicar`, { method: 'POST' });

export const cancelarEntryOrder = (id: string) =>
  req<EntryOrderDetail>(`/entry-orders/${id}/cancelar`, { method: 'POST' });

// ===== Presentación (compartida entre lista y detalle) =====

export const ENTRY_STATUS_LABEL: Record<EntryOrderStatus, string> = {
  borrador: 'Borrador',
  aplicada: 'Aplicada',
  cancelada: 'Cancelada',
};

export function entryStatusTone(status: EntryOrderStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (status === 'cancelada') return 'ro';
  if (status === 'aplicada') return 'on';
  return 'off'; // borrador
}

export const ORIGIN_LABEL: Record<EntryOrigin, string> = {
  compra: 'Compra',
  manual: 'Manual',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
};
