import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Transiciones válidas de una cita (no se reabre lo terminal)
const NEXT: Record<string, string[]> = {
  agendada: ['confirmada', 'completada', 'cancelada'],
  confirmada: ['completada', 'cancelada'],
  completada: [],
  cancelada: [],
};

// GET /api/appointments/{id} — detalle
export const GET = handle(async (_req, { params }) => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('appointments')
    .select('id, customer_id, patient_name, professional_id, starts_at, ends_at, status, notes, profiles!appointments_professional_id_fkey ( full_name )')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Cita no encontrada');
  return ok({ appointment: data });
});

const Patch = z.object({
  status: z.enum(['agendada', 'confirmada', 'completada', 'cancelada']).optional(),
  startsAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  endsAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
  notes: z.string().max(2000).optional(),
  patientName: z.string().min(1).max(160).optional(),
});

// PATCH /api/appointments/{id} — actualizar estado / reagendar / notas
export const PATCH = handle(async (req, { params }) => {
  await requireTenant();
  const body = Patch.parse(await req.json());
  const supabase = createSupabaseServerClient();

  const { data: current, error: cErr } = await supabase
    .from('appointments')
    .select('id, status, starts_at, ends_at')
    .eq('id', params.id)
    .maybeSingle();
  if (cErr) throw cErr;
  if (!current) throw new ApiError(404, 'Cita no encontrada');

  const patch: Record<string, unknown> = {};
  if (body.status && body.status !== (current as any).status) {
    const allowed = NEXT[(current as any).status] ?? [];
    if (!allowed.includes(body.status)) {
      throw new ApiError(400, `Transición no permitida: ${(current as any).status} → ${body.status}`);
    }
    patch.status = body.status;
  }
  if (body.startsAt) patch.starts_at = new Date(body.startsAt).toISOString();
  if (body.endsAt) patch.ends_at = new Date(body.endsAt).toISOString();
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.patientName) patch.patient_name = body.patientName;

  const starts = new Date((patch.starts_at as string) ?? (current as any).starts_at);
  const ends = new Date((patch.ends_at as string) ?? (current as any).ends_at);
  if (ends <= starts) throw new ApiError(422, 'La hora de fin debe ser posterior al inicio');

  if (!Object.keys(patch).length) return ok({ ok: true, unchanged: true });

  const { error } = await supabase.from('appointments').update(patch).eq('id', params.id);
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true });
});
