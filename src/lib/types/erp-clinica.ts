/**
 * CONTRATO F3 — Tipos compartidos de Clínicas/Agenda. Ver docs/erp/F3-CONTRATOS.md §C2.
 * PROPIEDAD DEL ORQUESTADOR: los subagentes de la Tanda B (agenda/expediente)
 * importan de aquí; NO editan este archivo. Pacientes = customers; profesionales
 * = profiles.
 */

export type AppointmentStatus =
  | 'agendada'
  | 'confirmada'
  | 'completada'
  | 'cancelada'
  | 'no_asistio';
export type AppointmentFreq = 'semanal' | 'quincenal' | 'mensual';

/** Profesional (perfil de staff del tenant) para asignar citas. */
export interface ProfessionalRef {
  id: string;
  name: string;
  role: string;
}

// ===== Citas =====

export interface AppointmentRow {
  id: string;
  customerId: string | null;
  patientName: string | null;
  professionalId: string;
  professionalName: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  resource: string | null;
  priceMxn: number | null;
  seriesId: string | null;
}

export interface AppointmentDetail extends AppointmentRow {
  notes: string | null;
  createdAt: string;
}

export interface AppointmentInput {
  customerId?: string | null;
  patientName?: string;
  professionalId: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  resource?: string;
  priceMxn?: number;
  notes?: string;
}

// ===== Series de recurrencia =====

export interface SeriesRow {
  id: string;
  professionalId: string;
  professionalName: string | null;
  customerId: string | null;
  patientName: string | null;
  freq: AppointmentFreq;
  weekday: number; // 0=domingo..6=sábado
  startTime: string; // 'HH:MM'
  durationMin: number;
  until: string; // fecha
  active: boolean;
  resource: string | null;
  priceMxn: number | null;
}

export interface SeriesInput {
  professionalId: string;
  customerId?: string | null;
  patientName?: string;
  freq: AppointmentFreq;
  weekday: number;
  startTime: string;
  durationMin?: number;
  until: string;
  resource?: string;
  priceMxn?: number;
}

// ===== Notas clínicas (confidenciales por autor) =====

export interface ClinicalNoteRow {
  id: string;
  appointmentId: string | null;
  customerId: string | null;
  professionalId: string;
  professionalName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalNoteInput {
  appointmentId?: string | null;
  customerId?: string | null;
  body: string;
}
