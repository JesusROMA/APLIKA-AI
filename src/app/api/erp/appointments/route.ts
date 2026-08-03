import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import {
  APPT_SELECT,
  appointmentInputSchema,
  mapAppointmentRow,
  resolvePatientName,
  throwApptError,
  type AppointmentJoinRow,
} from './_shared';

export const dynamic = 'force-dynamic';

/** Query de la agenda: rango obligatorio + filtro opcional por profesional. */
const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  professionalId: z.string().uuid().optional(),
});

// GET /api/erp/appointments — citas por rango (calendario/ver). No paginado.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'calendario', 'ver');
  const supabase = erpClientFor(session);

  const url = new URL(req.url);
  const { from, to, professionalId } = rangeSchema.parse({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    professionalId: url.searchParams.get('professionalId') ?? undefined,
  });
  if (to < from) throw new ApiError(422, 'El rango es inválido: "to" es anterior a "from"');

  let q = supabase
    .from('appointments')
    .select(APPT_SELECT)
    .gte('starts_at', from)
    .lte('starts_at', to);
  if (professionalId) q = q.eq('professional_id', professionalId);

  const { data, error } = await q.order('starts_at', { ascending: true });
  if (error) throw error;

  const rows = ((data ?? []) as unknown as AppointmentJoinRow[]).map(mapAppointmentRow);
  return ok({ data: rows });
});

// POST /api/erp/appointments — alta de cita (calendario/crear).
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'calendario', 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const body = appointmentInputSchema.parse(await req.json());
  if (new Date(body.endsAt) <= new Date(body.startsAt)) {
    throw new ApiError(422, 'La cita debe terminar después de que empieza');
  }

  const patientName = await resolvePatientName(
    supabase,
    { patientName: body.patientName, customerId: body.customerId },
    true,
  );

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: orgId,
      professional_id: body.professionalId,
      customer_id: body.customerId ?? null,
      patient_name: patientName!,
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      status: 'agendada',
      resource: body.resource ?? null,
      price_mxn: body.priceMxn ?? null,
      notes: body.notes ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throwApptError(error);

  return ok({ ok: true, id: data!.id }, { status: 201 });
});
