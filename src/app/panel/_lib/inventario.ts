/**
 * Cliente fetch del módulo Inventario (F2 · Tanda B, área Movimientos). Wrappers
 * tipados a /api/erp/inventory/*, mismo estilo que _lib/api.ts / _lib/ventas-api.ts
 * (reusa `ApiError` de ./api). El servidor es la autoridad; esto sólo transporta.
 */

import type { ListParams, Paginated } from '@/lib/types/erp';
import type {
  StockRow,
  KardexRow,
  MovementInput,
  ValuationRow,
} from '@/lib/types/erp-inventario';
import { ApiError } from './api';

const BASE = '/api/erp/inventory';

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

/** Params del listado de existencias: paginación/búsqueda + almacén opcional. */
export interface StockListParams extends ListParams {
  warehouseId?: string;
}

/** GET existencias paginadas (sku/nombre + filtro de almacén opcional). */
export function listStock(p?: StockListParams): Promise<Paginated<StockRow>> {
  const q = new URLSearchParams();
  if (p?.page) q.set('page', String(p.page));
  if (p?.pageSize) q.set('pageSize', String(p.pageSize));
  if (p?.search) q.set('search', p.search);
  if (p?.warehouseId) q.set('warehouseId', p.warehouseId);
  const s = q.toString();
  return req<Paginated<StockRow>>(s ? `?${s}` : '');
}

/** Params del kardex de una variante (almacén opcional). */
export interface KardexParams {
  variantId: string;
  warehouseId?: string;
  page?: number;
  pageSize?: number;
}

/** GET kardex paginado de una variante (opcionalmente acotado a un almacén). */
export function getKardex(p: KardexParams): Promise<Paginated<KardexRow>> {
  const q = new URLSearchParams({ variantId: p.variantId });
  if (p.warehouseId) q.set('warehouseId', p.warehouseId);
  if (p.page) q.set('page', String(p.page));
  if (p.pageSize) q.set('pageSize', String(p.pageSize));
  return req<Paginated<KardexRow>>(`/kardex?${q.toString()}`);
}

/** POST alta de movimiento manual (entrada/salida/ajuste). */
export function createMovement(body: MovementInput): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>('/movimientos', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** GET valuación de inventario por almacén + total general. */
export function getValuacion(): Promise<{ data: ValuationRow[]; totalValue: number }> {
  return req<{ data: ValuationRow[]; totalValue: number }>('/valuacion');
}
