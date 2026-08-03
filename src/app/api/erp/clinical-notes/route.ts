import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import {
  EXPEDIENTE,
  NOTE_SELECT,
  mapNoteRow,
  noteInputSchema,
  type ClinicalNoteJoinRow,
} from './_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/clinical-notes — notas de un paciente (expediente/ver)
// La RLS ya limita a las notas del profesional actual + las del dueño; NO
// filtramos por autor aquí para que el dueño vea todas y cada profesional las
// suyas. Filtro obligatorio `?customerId=`; opcional `?appointmentId=`.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, EXPEDIENTE, 'ver');
  const supabase = erpClientFor(session);

  const url = new URL(req.url);
  const customerId = url.searchParams.get('customerId');
  const appointmentId = url.searchParams.get('appointmentId');
  if (!customerId) throw new ApiError(400, 'Falta el parámetro customerId');

  let q = supabase.from('clinical_notes').select(NOTE_SELECT).eq('customer_id', customerId);
  if (appointmentId) q = q.eq('appointment_id', appointmentId);

  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;

  const rows = ((data ?? []) as unknown as ClinicalNoteJoinRow[]).map(mapNoteRow);
  return ok({ data: rows });
});

// POST /api/erp/clinical-notes — alta de nota (expediente/crear)
// El autor SIEMPRE es la sesión (professional_id = auth.uid()); la RLS de INSERT
// lo exige. La nota queda confidencial: sólo su autor y el dueño la verán.
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, EXPEDIENTE, 'crear');
  const supabase = erpClientFor(session);
  const orgId = session.organization!.id;

  const body = noteInputSchema.parse(await req.json());

  const { data, error } = await supabase
    .from('clinical_notes')
    .insert({
      organization_id: orgId,
      professional_id: session.userId,
      customer_id: body.customerId ?? null,
      appointment_id: body.appointmentId ?? null,
      body: body.body,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);

  return ok({ ok: true, id: data.id }, { status: 201 });
});
