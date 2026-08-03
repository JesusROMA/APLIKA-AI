/**
 * Cliente fetch del módulo AGENDA (namespaces ERP `/api/erp/appointments/*` y
 * `/api/erp/appointment-series/*`). Propiedad de AGENTE-AGENDA. Wrapper delgado
 * sobre fetch, mismo estilo que `_lib/api.ts` / `_lib/pedidos.ts`.
 */

import type { Paginated, ListParams } from '@/lib/types/erp';
import type {
  AppointmentRow,
  AppointmentDetail,
  AppointmentInput,
  AppointmentStatus,
  SeriesRow,
  SeriesInput,
  ProfessionalRef,
} from '@/lib/types/erp-clinica';
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

// ===== Citas =====

/** Agenda por rango (no paginada). Filtro opcional por profesional. */
export const listAppointmentsByRange = (
  from: string,
  to: string,
  professionalId?: string | null,
) => {
  const q = new URLSearchParams({ from, to });
  if (professionalId) q.set('professionalId', professionalId);
  return req<{ data: AppointmentRow[] }>(`/appointments?${q.toString()}`).then((r) => r.data);
};

export const getAppointment = (id: string) =>
  req<AppointmentDetail>(`/appointments/${id}`);

export const createAppointment = (body: AppointmentInput) =>
  req<{ ok: true; id: string }>('/appointments', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const patchAppointment = (
  id: string,
  body: {
    startsAt?: string;
    endsAt?: string;
    resource?: string | null;
    priceMxn?: number | null;
    patientName?: string;
    notes?: string | null;
  },
) =>
  req<AppointmentDetail>(`/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const setAppointmentEstado = (id: string, status: AppointmentStatus) =>
  req<AppointmentDetail>(`/appointments/${id}/estado`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });

export const listProfessionals = () =>
  req<{ data: ProfessionalRef[] }>('/appointments/professionals').then((r) => r.data);

// ===== Series =====

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

export const listSeries = (p?: ListParams) =>
  req<Paginated<SeriesRow>>(`/appointment-series${query(p)}`);

export const getSeries = (id: string) =>
  req<SeriesRow>(`/appointment-series/${id}`);

export const createSeries = (body: SeriesInput) =>
  req<{ ok: true; id: string }>('/appointment-series', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const generarSerie = (id: string) =>
  req<{ ok: true; creadas: number }>(`/appointment-series/${id}/generar`, {
    method: 'POST',
  });

// ===== Presentación de estados (compartida entre agenda y detalle) =====

export const APPT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

export function apptStatusTone(status: AppointmentStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (status === 'cancelada' || status === 'no_asistio') return 'ro';
  if (status === 'completada') return 'on';
  if (status === 'confirmada') return 'blue';
  return 'off'; // agendada
}

export const FREQ_LABEL = {
  semanal: 'Semanal',
  quincenal: 'Quincenal',
  mensual: 'Mensual',
} as const;

export const WEEKDAY_LABEL = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;
