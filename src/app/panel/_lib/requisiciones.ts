/**
 * Cliente fetch del submódulo REQUISICIONES (namespace ERP
 * `/api/erp/requisitions`). Propiedad de AGENTE-REQUISICIONES. Wrapper delgado
 * sobre fetch, mismo estilo que `_lib/compras.ts`. Incluye `listSuppliers`
 * (selector de proveedor al convertir) contra `/api/erp/suppliers`.
 */

import type { Paginated, ListParams } from '@/lib/types/erp';
import type {
  RequisitionRow,
  RequisitionDetail,
  RequisitionStatus,
  RequisitionItemInput,
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

// ===== Requisiciones =====

export interface NewRequisitionInput {
  notas?: string | null;
  lines: RequisitionItemInput[];
}

export interface UpdateRequisitionInput {
  notas?: string | null;
  lines?: RequisitionItemInput[];
}

export const listRequisitions = (p?: ListParams) =>
  req<Paginated<RequisitionRow>>(`/requisitions${query(p)}`);

export const getRequisition = (id: string) =>
  req<RequisitionDetail>(`/requisitions/${id}`);

export const createRequisition = (body: NewRequisitionInput) =>
  req<{ ok: true; id: string }>('/requisitions', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateRequisition = (id: string, body: UpdateRequisitionInput) =>
  req<RequisitionDetail>(`/requisitions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const aprobarRequisition = (id: string) =>
  req<RequisitionDetail>(`/requisitions/${id}/aprobar`, { method: 'POST' });

export const rechazarRequisition = (id: string, motivo?: string | null) =>
  req<RequisitionDetail>(`/requisitions/${id}/rechazar`, {
    method: 'POST',
    body: JSON.stringify({ motivo: motivo ?? null }),
  });

export const convertirRequisition = (id: string, supplierId: string) =>
  req<{ ok: true; purchaseOrderId: string }>(`/requisitions/${id}/convertir`, {
    method: 'POST',
    body: JSON.stringify({ supplierId }),
  });

// ===== Proveedores (para el selector al convertir) =====

export const listSuppliers = (p?: ListParams) =>
  req<Paginated<SupplierRow>>(`/suppliers${query(p)}`);

// ===== Presentación de estados (compartida entre lista y detalle) =====

export const REQ_STATUS_LABEL: Record<RequisitionStatus, string> = {
  borrador: 'Borrador',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  convertida: 'Convertida',
  cancelada: 'Cancelada',
};

export function reqStatusTone(status: RequisitionStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (status === 'rechazada' || status === 'cancelada') return 'ro';
  if (status === 'borrador') return 'off';
  if (status === 'aprobada') return 'on';
  return 'blue'; // convertida
}
