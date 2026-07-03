import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { dateLong } from '@/lib/format';
import { parseBookingMessage } from '@/lib/appointments/whatsapp';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  agendada: 'Agendada', confirmada: 'Confirmada', completada: 'Completada', cancelada: 'Cancelada',
};

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Mexico_City',
  } as Intl.DateTimeFormatOptions);
}

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

const SELECT =
  'id, customer_id, patient_name, professional_id, starts_at, ends_at, status, notes, profiles!appointments_professional_id_fkey ( full_name )';

const Body = z.object({
  message: z.string().min(1, 'El mensaje de WhatsApp no puede estar vacío').max(2000),
  patientName: z.string().min(1, 'Falta el nombre del paciente').max(160),
  phone: z.string().max(40).optional(),
  professionalId: z.string().uuid().optional(),
  // Override manual del inicio (si el operador corrige lo detectado)
  startsAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  durationMin: z.number().int().min(5).max(600).default(50),
  notes: z.string().max(2000).optional(),
});

// POST /api/appointments/whatsapp
// Crea una cita a partir de un mensaje de WhatsApp: interpreta fecha/hora del
// texto (o usa el startsAt provisto), inserta la cita (status: agendada) y
// registra la conversación en la bandeja del Agente IA (best-effort).
export const POST = handle(async (req) => {
  const ctx = await requireTenant();
  const body = Body.parse(await req.json());
  const supabase = createSupabaseServerClient();

  // 1) Determinar el inicio: override manual o interpretación del mensaje.
  let startsIso = body.startsAt ?? null;
  const parsed = parseBookingMessage(body.message);
  if (!startsIso) startsIso = parsed.startsAt;
  if (!startsIso) {
    throw new ApiError(422, 'No se pudo interpretar la fecha y hora del mensaje. Indica el horario o corrígelo manualmente.', {
      parsed,
    });
  }

  const starts = new Date(startsIso);
  const ends = new Date(starts.getTime() + body.durationMin * 60000);

  const notes = body.notes ?? `Reserva por WhatsApp${body.phone ? ' · ' + body.phone : ''} — «${body.message.trim()}»`;

  // 2) Crear la cita.
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: ctx.organizationId,
      patient_name: body.patientName,
      professional_id: body.professionalId ?? ctx.userId,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      notes,
      created_by: ctx.userId,
    })
    .select(SELECT)
    .single();
  if (error) throw new ApiError(400, error.message);

  // 3) Registrar la conversación de WhatsApp (best-effort; no rompe la cita).
  try {
    const { data: conv } = await supabase
      .from('ai_conversations')
      .insert({
        organization_id: ctx.organizationId,
        customer_phone: body.phone ?? null,
        customer_name: body.patientName,
        tag: 'Cita',
        appointment: true,
        resolved: true,
        unread: false,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (conv?.id) {
      await supabase.from('ai_messages').insert([
        { organization_id: ctx.organizationId, conversation_id: conv.id, role: 'user', body: body.message.trim() },
        {
          organization_id: ctx.organizationId,
          conversation_id: conv.id,
          role: 'agent',
          body: `Listo ✅ Tu cita quedó agendada para el ${dateLong(starts.toISOString())} a las ${hhmm(starts.toISOString())}.`,
        },
      ]);
    }
  } catch {
    /* la bandeja del agente es opcional en este flujo */
  }

  return ok({ ok: true, appointment: toRow(data), parsed }, { status: 201 });
});
