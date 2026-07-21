/**
 * Cliente fetch del submódulo PEDIDOS (namespace ERP `/api/erp/orders`).
 * Propiedad de AGENTE-PEDIDOS. Wrapper delgado sobre fetch, mismo estilo que
 * `_lib/api.ts` / `_lib/ventas-api.ts`. No reemplaza al cliente compartido.
 */

import type { Paginated, ListParams } from '@/lib/types/erp';
import type {
  OrderRow,
  OrderDetail,
  OrderStatus,
  DocLineInput,
  DeliveryLineInput,
} from '@/lib/types/erp-ventas';
import { ApiError } from '@/app/panel/_lib/api';

const BASE = '/api/erp/orders';

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

export interface NewOrderInput {
  customerId?: string | null;
  warehouseId?: string | null;
  channel?: string;
  notes?: string;
  lines: DocLineInput[];
}

export const listOrders = (p?: ListParams) => req<Paginated<OrderRow>>(query(p));

export const getOrder = (id: string) => req<OrderDetail>(`/${id}`);

export const createOrder = (body: NewOrderInput) =>
  req<{ ok: true; id: string }>('', { method: 'POST', body: JSON.stringify(body) });

export const updateOrder = (id: string, body: { notes?: string | null; lines?: DocLineInput[] }) =>
  req<OrderDetail>(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const transitionOrder = (id: string, status: OrderStatus) =>
  req<OrderDetail>(`/${id}/transition`, { method: 'POST', body: JSON.stringify({ status }) });

export const deliverOrder = (id: string, lines: DeliveryLineInput[]) =>
  req<OrderDetail>(`/${id}/deliver`, { method: 'POST', body: JSON.stringify({ lines }) });

// ===== Presentación de estados (compartida entre lista y detalle) =====

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  pagado: 'Pagado',
  surtido_parcial: 'Surtido parcial',
  surtido: 'Surtido',
  facturado: 'Facturado',
  enviado: 'Enviado',
  cancelada: 'Cancelada',
};

export function orderStatusTone(status: OrderStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (status === 'cancelada') return 'ro';
  if (status === 'borrador') return 'off';
  if (['pagado', 'surtido', 'facturado', 'enviado'].includes(status)) return 'on';
  return 'blue';
}
