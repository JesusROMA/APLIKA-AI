/**
 * Cliente fetch del submódulo COMPRAS (namespace ERP
 * `/api/erp/purchase-orders`). Propiedad de AGENTE-COMPRAS. Wrapper delgado
 * sobre fetch, mismo estilo que `_lib/traspasos.ts` / `_lib/pedidos.ts`.
 * Incluye `listSuppliers` (selector de proveedor) contra `/api/erp/suppliers`.
 */

import type { Paginated, ListParams } from '@/lib/types/erp';
import type {
  PurchaseOrderRow,
  PurchaseOrderDetail,
  PurchaseOrderStatus,
  POLineInput,
  ReceiveLineInput,
  SupplierRow,
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

// ===== Órdenes de compra =====

export interface NewPurchaseOrderInput {
  supplierId: string;
  warehouseId?: string | null;
  expectedDate?: string | null;
  notas?: string | null;
  lines: POLineInput[];
}

export interface UpdatePurchaseOrderInput {
  notas?: string | null;
  lines?: POLineInput[];
}

export const listPurchaseOrders = (p?: ListParams) =>
  req<Paginated<PurchaseOrderRow>>(`/purchase-orders${query(p)}`);

export const getPurchaseOrder = (id: string) =>
  req<PurchaseOrderDetail>(`/purchase-orders/${id}`);

export const createPurchaseOrder = (body: NewPurchaseOrderInput) =>
  req<{ ok: true; id: string }>('/purchase-orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updatePurchaseOrder = (id: string, body: UpdatePurchaseOrderInput) =>
  req<PurchaseOrderDetail>(`/purchase-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const confirmarPurchaseOrder = (id: string) =>
  req<PurchaseOrderDetail>(`/purchase-orders/${id}/confirmar`, { method: 'POST' });

export const recibirPurchaseOrder = (id: string, lines: ReceiveLineInput[]) =>
  req<PurchaseOrderDetail>(`/purchase-orders/${id}/recibir`, {
    method: 'POST',
    body: JSON.stringify({ lines }),
  });

export const cancelarPurchaseOrder = (id: string) =>
  req<PurchaseOrderDetail>(`/purchase-orders/${id}/cancelar`, { method: 'POST' });

// ===== Proveedores (para el selector del alta) =====

export const listSuppliers = (p?: ListParams) =>
  req<Paginated<SupplierRow>>(`/suppliers${query(p)}`);

// ===== Presentación de estados (compartida entre lista y detalle) =====

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  borrador: 'Borrador',
  confirmada: 'Confirmada',
  recibida_parcial: 'Recibida parcial',
  recibida: 'Recibida',
  cancelada: 'Cancelada',
};

export function poStatusTone(status: PurchaseOrderStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (status === 'cancelada') return 'ro';
  if (status === 'borrador') return 'off';
  if (status === 'recibida') return 'on';
  return 'blue'; // confirmada / recibida_parcial
}
