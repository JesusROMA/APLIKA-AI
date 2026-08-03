import { z } from 'zod';
import type { ModuleKey } from '@/lib/types/erp';
import type { Tables } from '@/lib/supabase/database.types';
import type { ClinicalNoteRow } from '@/lib/types/erp-clinica';

/**
 * Piezas internas del módulo `expediente` (notas clínicas). No es una route
 * (prefijo `_`): esquemas zod, mapeos a camelCase y constantes de módulo. La
 * confidencialidad la hace cumplir la RLS de `clinical_notes` (solo autor +
 * dueño); este código sólo la refleja.
 */
export const EXPEDIENTE: ModuleKey = 'expediente';

/** Columnas + join del autor que consumen los mapeos de notas. */
export const NOTE_SELECT =
  'id, appointment_id, customer_id, professional_id, body, created_at, updated_at, ' +
  'profiles!clinical_notes_professional_id_fkey ( full_name )';

/** Fila cruda de `clinical_notes` con el join al perfil del autor. */
export type ClinicalNoteJoinRow = Pick<
  Tables<'clinical_notes'>,
  | 'id'
  | 'appointment_id'
  | 'customer_id'
  | 'professional_id'
  | 'body'
  | 'created_at'
  | 'updated_at'
> & { profiles: { full_name: string | null } | null };

/** Mapea la fila de BD (snake + join) a la forma camelCase del contrato. */
export function mapNoteRow(row: ClinicalNoteJoinRow): ClinicalNoteRow {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    customerId: row.customer_id,
    professionalId: row.professional_id,
    professionalName: row.profiles?.full_name ?? null,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ===== Validación (zod) =====

/** Alta de nota: `body` requerido; ligas opcionales a paciente/cita. */
export const noteInputSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  appointmentId: z.string().uuid().nullable().optional(),
  body: z.string().trim().min(1, 'La nota no puede estar vacía'),
});

/** Edición de nota: sólo el cuerpo. */
export const notePatchSchema = z.object({
  body: z.string().trim().min(1, 'La nota no puede estar vacía'),
});

export type NoteInput = z.infer<typeof noteInputSchema>;
