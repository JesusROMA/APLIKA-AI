import { z } from 'zod';
import { ApiError } from '@/lib/api';
import type { Tables } from '@/lib/supabase/database.types';
import type { SeriesRow } from '@/lib/types/erp-clinica';

/**
 * Piezas internas COMPARTIDAS por los endpoints de series de recurrencia
 * (módulo `calendario`). Esquemas zod + mapeos a camelCase. La generación de
 * citas la hace la RPC `generar_serie` (valida permisos y omite empalmes).
 */

export const SERIES_SELECT =
  'id, professional_id, customer_id, patient_name, freq, weekday, start_time, duration_min, until, active, resource, price_mxn, professional:profiles!appointment_series_professional_id_fkey ( full_name )';

export type SeriesJoinRow = Pick<
  Tables<'appointment_series'>,
  | 'id'
  | 'professional_id'
  | 'customer_id'
  | 'patient_name'
  | 'freq'
  | 'weekday'
  | 'start_time'
  | 'duration_min'
  | 'until'
  | 'active'
  | 'resource'
  | 'price_mxn'
> & {
  professional: { full_name: string | null } | null;
};

export function mapSeriesRow(r: SeriesJoinRow): SeriesRow {
  return {
    id: r.id,
    professionalId: r.professional_id,
    professionalName: r.professional?.full_name ?? null,
    customerId: r.customer_id,
    patientName: r.patient_name,
    freq: r.freq,
    weekday: r.weekday,
    startTime: r.start_time.slice(0, 5), // 'HH:MM:SS' → 'HH:MM'
    durationMin: r.duration_min,
    until: r.until,
    active: r.active,
    resource: r.resource,
    priceMxn: r.price_mxn,
  };
}

export const seriesInputSchema = z.object({
  professionalId: z.string().uuid(),
  freq: z.enum(['semanal', 'quincenal', 'mensual']),
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)'),
  durationMin: z.number().int().positive().default(60),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  customerId: z.string().uuid().nullable().optional(),
  patientName: z.string().trim().min(1).optional(),
  resource: z.string().trim().min(1).optional(),
  priceMxn: z.number().nonnegative().optional(),
});
export type SeriesInputBody = z.infer<typeof seriesInputSchema>;

export async function loadSeriesDetail(
  supabase: import('@/lib/erp/db').ErpClient,
  id: string,
): Promise<SeriesRow> {
  const { data, error } = await supabase
    .from('appointment_series')
    .select(SERIES_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!data) throw new ApiError(404, 'Serie no encontrada');
  return mapSeriesRow(data as unknown as SeriesJoinRow);
}
