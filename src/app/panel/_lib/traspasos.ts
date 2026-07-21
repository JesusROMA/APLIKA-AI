/**
 * Cliente fetch del submódulo TRASPASOS (namespace ERP
 * `/api/erp/inventory-transfers`). Propiedad de AGENTE-TRASPASOS. Wrapper delgado
 * sobre fetch, mismo estilo que `_lib/pedidos.ts` / `_lib/ventas-api.ts`. No
 * reemplaza al cliente compartido.
 */

import type { Paginated, ListParams } from '@/lib/types/erp';
import type {
  TransferRow,
  TransferDetail,
  TransferItemInput,
  TransferStatus,
} from '@/lib/types/erp-inventario';
import { ApiError } from '@/app/panel/_lib/api';

const BASE = '/api/erp/inventory-transfers';

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

export interface NewTransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  notas?: string;
  items: TransferItemInput[];
}

export interface UpdateTransferInput {
  notas?: string | null;
  items?: TransferItemInput[];
}

export const listTransfers = (p?: ListParams) => req<Paginated<TransferRow>>(query(p));

export const getTransfer = (id: string) => req<TransferDetail>(`/${id}`);

export const createTransfer = (body: NewTransferInput) =>
  req<{ ok: true; id: string }>('', { method: 'POST', body: JSON.stringify(body) });

export const updateTransfer = (id: string, body: UpdateTransferInput) =>
  req<TransferDetail>(`/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const enviarTransfer = (id: string) =>
  req<TransferDetail>(`/${id}/enviar`, { method: 'POST' });

export const recibirTransfer = (id: string) =>
  req<TransferDetail>(`/${id}/recibir`, { method: 'POST' });

export const cancelarTransfer = (id: string, motivo?: string) =>
  req<TransferDetail>(`/${id}/cancelar`, {
    method: 'POST',
    body: JSON.stringify({ motivo: motivo ?? '' }),
  });

// ===== Presentación de estados (compartida entre lista y detalle) =====

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  borrador: 'Borrador',
  en_transito: 'En tránsito',
  recibido: 'Recibido',
  cancelada: 'Cancelada',
};

export function transferStatusTone(status: TransferStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (status === 'cancelada') return 'ro';
  if (status === 'borrador') return 'off';
  if (status === 'recibido') return 'on';
  return 'blue'; // en_transito
}
