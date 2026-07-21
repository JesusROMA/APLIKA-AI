/**
 * Cliente fetch del submódulo CONTEOS (namespace ERP `/api/erp/inventory-counts`).
 * Propiedad de AGENTE-CONTEOS. Wrapper delgado sobre fetch, mismo estilo que
 * `_lib/ventas-api.ts` / `_lib/pedidos.ts`. No reemplaza al cliente compartido.
 */

import type { Paginated, ListParams } from '@/lib/types/erp';
import type { CountRow, CountDetail, CountStatus } from '@/lib/types/erp-inventario';
import { ApiError } from '@/app/panel/_lib/api';

const BASE = '/api/erp/inventory-counts';

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

export interface NewCountInput {
  warehouseId: string;
  notas?: string;
  variantIds?: string[];
}

/** Partida capturada (existencia física contra el sistema). */
export interface CapturaItem {
  productVariantId: string;
  countedQty: number;
}

export const listCounts = (p?: ListParams) => req<Paginated<CountRow>>(query(p));

export const getCount = (id: string) => req<CountDetail>(`/${id}`);

export const createCount = (body: NewCountInput) =>
  req<{ ok: true; id: string }>('', { method: 'POST', body: JSON.stringify(body) });

export const updateCaptura = (id: string, items: CapturaItem[]) =>
  req<CountDetail>(`/${id}`, { method: 'PATCH', body: JSON.stringify({ items }) });

export const aplicarCount = (id: string) =>
  req<CountDetail>(`/${id}/aplicar`, { method: 'POST' });

export const cancelarCount = (id: string) =>
  req<CountDetail>(`/${id}/cancelar`, { method: 'POST' });

// ===== Presentación de estados (compartida entre lista y detalle) =====

export const COUNT_STATUS_LABEL: Record<CountStatus, string> = {
  borrador: 'Borrador',
  en_conteo: 'En conteo',
  aplicado: 'Aplicado',
  cancelada: 'Cancelada',
};

export function countStatusTone(status: CountStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (status === 'cancelada') return 'ro';
  if (status === 'borrador') return 'off';
  if (status === 'aplicado') return 'on';
  return 'blue'; // en_conteo
}
