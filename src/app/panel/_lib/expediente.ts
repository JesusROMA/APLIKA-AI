/**
 * Cliente fetch del módulo EXPEDIENTE (namespace ERP `/api/erp/clinical-notes`).
 * Propiedad de AGENTE-EXPEDIENTE. Wrapper delgado sobre fetch, mismo estilo que
 * `_lib/ventas-api.ts` / `_lib/pedidos.ts`. No reemplaza al cliente compartido.
 */

import type {
  AppointmentStatus,
  ClinicalNoteRow,
  ClinicalNoteInput,
} from '@/lib/types/erp-clinica';
import { ApiError } from '@/app/panel/_lib/api';

const BASE = '/api/erp/clinical-notes';

/** Cita del historial de un paciente (forma que expone el endpoint propio). */
export interface HistorialItem {
  id: string;
  startsAt: string;
  status: AppointmentStatus;
  professionalName: string | null;
}

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

/** Notas clínicas del paciente visibles bajo RLS (autor + dueño). */
export function listByPatient(customerId: string, appointmentId?: string | null) {
  const q = new URLSearchParams({ customerId });
  if (appointmentId) q.set('appointmentId', appointmentId);
  return req<{ data: ClinicalNoteRow[] }>(`?${q.toString()}`).then((r) => r.data);
}

/** Detalle de una nota (404 si la RLS no la deja ver). */
export function get(id: string) {
  return req<ClinicalNoteRow>(`/${id}`);
}

/** Alta de nota (el autor es la sesión; queda confidencial). */
export function create(input: ClinicalNoteInput) {
  return req<{ ok: true; id: string }>('', { method: 'POST', body: JSON.stringify(input) });
}

/** Edita el cuerpo de una nota propia (403 si no eres el autor). */
export function update(id: string, body: string) {
  return req<ClinicalNoteRow>(`/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
}

/** Historial de citas del paciente (endpoint propio del expediente). */
export function historial(customerId: string) {
  const q = new URLSearchParams({ customerId });
  return req<{ data: HistorialItem[] }>(`/historial?${q.toString()}`).then((r) => r.data);
}
