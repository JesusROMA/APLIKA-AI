import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import {
  EXPEDIENTE,
  NOTE_SELECT,
  mapNoteRow,
  notePatchSchema,
  type ClinicalNoteJoinRow,
} from '../_shared';

export const dynamic = 'force-dynamic';

// GET /api/erp/clinical-notes/[id] — detalle de una nota (expediente/ver)
// 404 si la RLS no la deja ver (no es autor ni dueño).
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, EXPEDIENTE, 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('clinical_notes')
    .select(NOTE_SELECT)
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Nota no encontrada');

  return ok(mapNoteRow(data as unknown as ClinicalNoteJoinRow));
});

// PATCH /api/erp/clinical-notes/[id] — editar el cuerpo (expediente/editar)
// Solo el autor puede editar: la RLS de UPDATE lo hace cumplir. Si el usuario no
// es autor, el update afecta 0 filas → respondemos con un mensaje claro.
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, EXPEDIENTE, 'editar');
  const supabase = erpClientFor(session);

  const body = notePatchSchema.parse(await req.json());

  // ¿La nota es visible para esta sesión? (autor o dueño) → distingue 404 de 403.
  const { data: current, error: readErr } = await supabase
    .from('clinical_notes')
    .select('id')
    .eq('id', params.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current) throw new ApiError(404, 'Nota no encontrada');

  const { data, error } = await supabase
    .from('clinical_notes')
    .update({ body: body.body })
    .eq('id', params.id)
    .select(NOTE_SELECT)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message);
  // Visible pero update sin filas ⇒ la RLS bloqueó por no ser autor.
  if (!data) throw new ApiError(403, 'Solo el autor puede editar esta nota');

  return ok(mapNoteRow(data as unknown as ClinicalNoteJoinRow));
});
