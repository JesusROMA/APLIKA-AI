/**
 * Cliente fetch del módulo CRM (F7 · Tanda B — AGENTE-CRM). Wrappers sobre
 * /api/erp/prospects/* y /api/erp/crm/*. Mismo estilo que _lib/api.ts; los
 * tipos vienen del contrato del orquestador (@/lib/types/erp-crm) y sólo se
 * importan. La lista de clientes se toma de _lib/api (`listCustomers`).
 */

import type { Paginated, ListParams } from '@/lib/types/erp';
import type {
  ProspectRow,
  ProspectInput,
  ProspectStage,
  CustomerHistory,
} from '@/lib/types/erp-crm';
import { ApiError } from './api';

const BASE = '/api/erp';

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    /* respuesta sin JSON */
  }
  return `Error ${res.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Query con paginación + `status` (usado aquí como filtro de etapa). */
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

// ===== Prospectos =====

/** Listado paginado; `status` (ListParams) filtra por etapa. */
export const listProspects = (p?: ListParams) =>
  request<Paginated<ProspectRow>>(`/prospects${query(p)}`);

export const getProspect = (id: string) => request<ProspectRow>(`/prospects/${id}`);

export const createProspect = (body: ProspectInput) =>
  request<{ ok: true; id: string }>('/prospects', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateProspect = (id: string, body: Partial<ProspectInput>) =>
  request<{ ok: true }>(`/prospects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

/** Convierte el prospecto en cliente y lo marca como 'ganado'. */
export const convertProspect = (id: string) =>
  request<{ ok: true; customerId: string }>(`/prospects/${id}/convertir`, {
    method: 'POST',
  });

// ===== Vista 360 de cliente =====

export const getCustomerHistory = (id: string) =>
  request<CustomerHistory>(`/crm/customers/${id}/history`);

// ===== Etiquetas / tonos de etapa =====

export const PROSPECT_STAGE_LABEL: Record<ProspectStage, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  propuesta: 'Propuesta',
  ganado: 'Ganado',
  perdido: 'Perdido',
};

/** Orden canónico del embudo para selects/tableros. */
export const PROSPECT_STAGES: ProspectStage[] = [
  'nuevo',
  'contactado',
  'propuesta',
  'ganado',
  'perdido',
];

/** Tono de `Badge` (on|off|blue|ro) para cada etapa. */
export function prospectStageTone(stage: ProspectStage): 'on' | 'off' | 'blue' | 'ro' {
  switch (stage) {
    case 'ganado':
      return 'on';
    case 'perdido':
      return 'off';
    default:
      return 'blue';
  }
}
