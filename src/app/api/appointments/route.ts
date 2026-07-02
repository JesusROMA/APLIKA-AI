import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { dateLong } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

function hhmm(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Mexico_City' } as Intl.DateTimeFormatOptions);
}

/** Forma que consume la vista DC de calendario (fechas formateadas + ISO crudo). */
function toRow(a: any) {
  return {
    id: a.id,
    patient: a.patient_name,
    customerId: a.customer_id,
    professional: a.profiles?.full_name ?? '—',
    professionalId: a.professional_id,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    date: dateLong(a.starts_at),
    time: hhmm(a.starts_at),
    endTime: hhmm(a.ends_at),
    status: a.status,
    statusLabel: STATUS_LABEL[a.status] ?? a.status,
    notes: a.notes ?? '',
  };
}

// GET /api/appointments?from=ISO&to=ISO — citas del tenant en un rango de fechas.
// Sin rango: próximas (desde hoy 00:00) limitadas a 50.
export const GET = handle(async (req) => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const status = url.searchParams.get('status');

  let query = supabase
    .from('appointments')
    .select('id, customer_id, patient_name, professional_id, starts_at, ends_at, status, notes, profiles!appointments_professional_id_fkey ( full_name )')
    .order('starts_at', { ascending: true });

  if (from) query = query.gte('starts_at', from);
  else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query = query.gte('starts_at', today.toISOString()).limit(50);
  }
  if (to) query = query.lte('starts_at', to);
  if (status && status !== 'todas') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return ok({ appointments: (data ?? []).map(toRow) });
});

const NewAppointment = z.object({
  patientName: z.string().min(1, 'Escribe el nombre del paciente').max(160),
  customerId: z.string().uuid().optional(),
  professionalId: z.string().uuid().optional(),
  startsAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  endsAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  durationMin: z.number().int().min(5).max(600).default(50),
  notes: z.string().max(2000).optional(),
});

// POST /api/appointments — crea una cita (status inicial: agendada)
export const POST = handle(async (req) => {
  const ctx = await requireTenant();
  const body = NewAppointment.parse(await req.json());
  const supabase = createSupabaseServerClient();

  const starts = new Date(body.startsAt);
  const ends = body.endsAt ? new Date(body.endsAt) : new Date(starts.getTime() + body.durationMin * 60000);
  if (ends <= starts) throw new ApiError(422, 'La hora de fin debe ser posterior al inicio');

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: ctx.organizationId,
      patient_name: body.patientName,
      customer_id: body.customerId ?? null,
      professional_id: body.professionalId ?? ctx.userId,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      notes: body.notes ?? null,
      created_by: ctx.userId,
    })
    .select('id, customer_id, patient_name, professional_id, starts_at, ends_at, status, notes, profiles!appointments_professional_id_fkey ( full_name )')
    .single();
  if (error) throw new ApiError(400, error.message);

  return ok({ ok: true, appointment: toRow(data) }, { status: 201 });
});
