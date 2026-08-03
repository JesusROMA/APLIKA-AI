import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { TablesUpdate } from '@/lib/supabase/database.types';
import {
  appointmentPatchSchema,
  loadAppointmentDetail,
  throwApptError,
} from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/appointments/[id] — detalle de cita (calendario/ver).
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'calendario', 'ver');
  const supabase = erpClientFor(session);
  return ok(await loadAppointmentDetail(supabase, params.id));
});

// PATCH /api/erp/appointments/[id] — reprograma / edita campos (calendario/editar).
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'calendario', 'editar');
  const supabase = erpClientFor(session);
  const b = appointmentPatchSchema.parse(await req.json());

  const { data: current, error: curErr } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (curErr) throw new ApiError(400, curErr.message);
  if (!current) throw new ApiError(404, 'Cita no encontrada');
  if (current.status === 'cancelada') {
    throw new ApiError(409, 'No se puede editar una cita cancelada');
  }

  const upd: TablesUpdate<'appointments'> = {};
  if (b.startsAt !== undefined && b.endsAt !== undefined) {
    if (new Date(b.endsAt) <= new Date(b.startsAt)) {
      throw new ApiError(422, 'La cita debe terminar después de que empieza');
    }
    upd.starts_at = b.startsAt;
    upd.ends_at = b.endsAt;
  }
  if (b.resource !== undefined) upd.resource = b.resource;
  if (b.priceMxn !== undefined) upd.price_mxn = b.priceMxn;
  if (b.patientName !== undefined) upd.patient_name = b.patientName;
  if (b.notes !== undefined) upd.notes = b.notes;

  if (Object.keys(upd).length > 0) {
    const { error } = await supabase.from('appointments').update(upd).eq('id', params.id);
    if (error) throwApptError(error);
  }

  return ok(await loadAppointmentDetail(supabase, params.id));
});
