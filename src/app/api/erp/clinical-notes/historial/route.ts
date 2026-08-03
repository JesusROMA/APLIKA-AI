import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { AppointmentStatus } from '@/lib/types/erp-clinica';
import { EXPEDIENTE } from '../_shared';

export const dynamic = 'force-dynamic';

/** Ítem del historial de citas de un paciente (para el expediente). */
interface HistorialItem {
  id: string;
  startsAt: string;
  status: AppointmentStatus;
  professionalName: string | null;
}

type ApptHistRow = {
  id: string;
  starts_at: string;
  status: AppointmentStatus;
  profiles: { full_name: string | null } | null;
};

// GET /api/erp/clinical-notes/historial?customerId= — citas del paciente.
// Endpoint propio del expediente para no depender de la forma de /appointments
// (propiedad de AGENTE-AGENDA). Lee `appointments` directamente; la RLS de
// `calendario` aplica igual. Gate del módulo expediente (esta es su pantalla).
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, EXPEDIENTE, 'ver');
  const supabase = erpClientFor(session);

  const customerId = new URL(req.url).searchParams.get('customerId');
  if (!customerId) throw new ApiError(400, 'Falta el parámetro customerId');

  const { data, error } = await supabase
    .from('appointments')
    .select('id, starts_at, status, profiles!appointments_professional_id_fkey ( full_name )')
    .eq('customer_id', customerId)
    .order('starts_at', { ascending: false });
  if (error) throw error;

  const rows: HistorialItem[] = ((data ?? []) as unknown as ApptHistRow[]).map((r) => ({
    id: r.id,
    startsAt: r.starts_at,
    status: r.status,
    professionalName: r.profiles?.full_name ?? null,
  }));
  return ok({ data: rows });
});
