/**
 * Cliente fetch del maestro de Proveedores (F5 · Compras). Wrappers a
 * `/api/erp/suppliers/*`. Estilo `_lib/ventas-api.ts`: helper `req` propio +
 * `ApiError` de `./api`.
 */

import type { SupplierRow, SupplierInput } from '@/lib/types/erp-compras';
import type { ListParams, Paginated } from '@/lib/types/erp';
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

function qs(p?: ListParams): string {
  const q = new URLSearchParams();
  if (p?.page) q.set('page', String(p.page));
  if (p?.pageSize) q.set('pageSize', String(p.pageSize));
  if (p?.search) q.set('search', p.search);
  if (p?.status) q.set('status', p.status);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Listado paginado de proveedores (compras/ver). */
export function listSuppliers(p?: ListParams) {
  return req<Paginated<SupplierRow>>(`/suppliers${qs(p)}`);
}

/** Ficha de un proveedor (compras/ver). */
export function getSupplier(id: string) {
  return req<SupplierRow>(`/suppliers/${id}`);
}

/** Alta de proveedor (compras/crear). */
export function createSupplier(body: SupplierInput) {
  return req<{ ok: boolean; id: string }>('/suppliers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Edición parcial de proveedor (compras/editar). */
export function updateSupplier(id: string, body: Partial<SupplierInput>) {
  return req<{ ok: boolean }>(`/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
