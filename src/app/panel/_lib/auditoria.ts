/**
 * Cliente fetch de la Bitácora / auditoría (F4 · Tanda B, AGENTE-AUDIT).
 * Wrapper delgado sobre GET /api/erp/audit. La visibilidad real la impone la
 * RLS de `audit_log` (super_admin o tenant_admin de la org); si el rol no ve
 * nada, el server devuelve lista vacía y, si falta el permiso, 403.
 */

import type { Paginated } from '@/lib/types/erp';
import type { AuditRow } from '@/lib/types/erp-config';
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

export interface AuditListParams {
  page?: number;
  pageSize?: number;
  entityType?: string;
  action?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
}

/** Listado paginado de la bitácora con filtros opcionales. */
export function listAudit(params?: AuditListParams): Promise<Paginated<AuditRow>> {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.pageSize) q.set('pageSize', String(params.pageSize));
  if (params?.entityType) q.set('entityType', params.entityType);
  if (params?.action) q.set('action', params.action);
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  const s = q.toString();
  return req<Paginated<AuditRow>>(`/audit${s ? `?${s}` : ''}`);
}
