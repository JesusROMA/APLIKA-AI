import { z } from 'zod';
import { ApiError } from '@/lib/api';
import type { ErpClient } from '@/lib/erp/db';
import type { Tables } from '@/lib/supabase/database.types';
import type {
  AppointmentRow,
  AppointmentDetail,
  AppointmentStatus,
} from '@/lib/types/erp-clinica';

/**
 * Piezas internas COMPARTIDAS por los endpoints de citas (módulo `calendario`,
 * propiedad de AGENTE-AGENDA). No es una route (prefijo `_`): esquemas zod,
 * mapeos a camelCase, resolución de paciente y captura del empalme (23P01).
 */

// ===== SELECT con joins (paciente + profesional) =====

/**
 * Join a `customers(name)` (paciente) y a `profiles` por la FK del profesional
 * (`professional_id`) para exponer `professionalName`.
 */
export const APPT_SELECT =
  'id, customer_id, patient_name, professional_id, starts_at, ends_at, status, resource, price_mxn, series_id, customers ( name ), professional:profiles!appointments_professional_id_fkey ( full_name )';

export const APPT_DETAIL_SELECT = `${APPT_SELECT}, notes, created_at`;

/** Subconjunto de columnas + relaciones embebidas que consumen los mapeos. */
export type AppointmentJoinRow = Pick<
  Tables<'appointments'>,
  | 'id'
  | 'customer_id'
  | 'patient_name'
  | 'professional_id'
  | 'starts_at'
  | 'ends_at'
  | 'status'
  | 'resource'
  | 'price_mxn'
  | 'series_id'
> & {
  customers: { name: string } | null;
  professional: { full_name: string | null } | null;
};

export type AppointmentDetailJoinRow = AppointmentJoinRow &
  Pick<Tables<'appointments'>, 'notes' | 'created_at'>;

// ===== Mapeos a camelCase =====

export function mapAppointmentRow(r: AppointmentJoinRow): AppointmentRow {
  return {
    id: r.id,
    customerId: r.customer_id,
    patientName: r.patient_name,
    professionalId: r.professional_id ?? '',
    professionalName: r.professional?.full_name ?? null,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
    resource: r.resource,
    priceMxn: r.price_mxn,
    seriesId: r.series_id,
  };
}

export function mapAppointmentDetail(r: AppointmentDetailJoinRow): AppointmentDetail {
  return {
    ...mapAppointmentRow(r),
    notes: r.notes,
    createdAt: r.created_at,
  };
}

// ===== Validación (zod) =====

/** ISO con offset o 'Z' (lo que produce `Date.toISOString()`). */
const isoDateTime = z.string().datetime({ offset: true });

export const appointmentInputSchema = z.object({
  professionalId: z.string().uuid(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  customerId: z.string().uuid().nullable().optional(),
  patientName: z.string().trim().min(1).optional(),
  resource: z.string().trim().min(1).optional(),
  priceMxn: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});
export type AppointmentInputBody = z.infer<typeof appointmentInputSchema>;

export const appointmentPatchSchema = z
  .object({
    startsAt: isoDateTime.optional(),
    endsAt: isoDateTime.optional(),
    resource: z.string().trim().min(1).nullable().optional(),
    priceMxn: z.number().nonnegative().nullable().optional(),
    patientName: z.string().trim().min(1).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((b) => (b.startsAt === undefined) === (b.endsAt === undefined), {
    message: 'Reprogramar requiere startsAt y endsAt juntos',
    path: ['startsAt'],
  });
export type AppointmentPatchBody = z.infer<typeof appointmentPatchSchema>;

export const statusSchema = z.object({
  status: z.enum(['agendada', 'confirmada', 'completada', 'cancelada', 'no_asistio']),
});

// ===== Transiciones de estado =====

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  agendada: ['confirmada', 'cancelada', 'no_asistio'],
  confirmada: ['completada', 'cancelada', 'no_asistio'],
  completada: [],
  cancelada: [],
  no_asistio: [],
};

/** 409 si la transición de estado no es razonable (no retrocede desde final). */
export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (from === to) return; // idempotente: no-op válido
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ApiError(409, `Transición inválida: ${from} → ${to}`);
  }
}

// ===== Empalme (exclusion_violation) =====

/**
 * Traduce el error de un INSERT/UPDATE de `appointments`: un traslape del mismo
 * profesional (Postgres 23P01) → 409 con mensaje de negocio; el resto → 400.
 */
export function throwApptError(error: { code?: string; message: string }): never {
  if (error.code === '23P01') {
    throw new ApiError(409, 'Empalme: el profesional ya tiene una cita en ese horario');
  }
  throw new ApiError(400, error.message);
}

// ===== Resolución de paciente =====

/**
 * `appointments.patient_name` es NOT NULL. Usa el nombre explícito o, si sólo
 * hay `customerId`, lo resuelve del maestro de clientes. Cuando `required`,
 * lanza 422 si no puede determinarlo.
 */
export async function resolvePatientName(
  supabase: ErpClient,
  opts: { patientName?: string | null; customerId?: string | null },
  required: boolean,
): Promise<string | null> {
  const explicit = opts.patientName?.trim();
  if (explicit) return explicit;
  if (opts.customerId) {
    const { data, error } = await supabase
      .from('customers')
      .select('name')
      .eq('id', opts.customerId)
      .maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (data?.name) return data.name;
  }
  if (required) {
    throw new ApiError(422, 'Se requiere el nombre del paciente o un cliente');
  }
  return null;
}

// ===== Carga de detalle =====

export async function loadAppointmentDetail(
  supabase: ErpClient,
  id: string,
): Promise<AppointmentDetail> {
  const { data, error } = await supabase
    .from('appointments')
    .select(APPT_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!data) throw new ApiError(404, 'Cita no encontrada');
  return mapAppointmentDetail(data as unknown as AppointmentDetailJoinRow);
}
