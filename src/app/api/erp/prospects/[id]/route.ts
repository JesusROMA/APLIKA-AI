import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { TablesUpdate } from '@/lib/supabase/database.types';
import type { ProspectRow, ProspectStage } from '@/lib/types/erp-crm';

export const dynamic = 'force-dynamic';

const STAGES = ['nuevo', 'contactado', 'propuesta', 'ganado', 'perdido'] as const;

const SELECT =
  'id, name, contact_name, phone, email, source, stage, notas, customer_id, created_at';

function toRow(p: {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  stage: ProspectStage;
  notas: string | null;
  customer_id: string | null;
  created_at: string;
}): ProspectRow {
  return {
    id: p.id,
    name: p.name,
    contactName: p.contact_name,
    phone: p.phone,
    email: p.email,
    source: p.source,
    stage: p.stage,
    notas: p.notas,
    customerId: p.customer_id,
    createdAt: p.created_at,
  };
}

// GET /api/erp/prospects/[id] — ficha (crm/ver)
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'crm', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('crm_prospects')
    .select(SELECT)
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Prospecto no encontrado');
  return ok(toRow(data));
});

const Patch = z.object({
  name: z.string().min(1).optional(),
  contactName: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().email().nullable().optional(),
  source: z.string().trim().nullable().optional(),
  stage: z.enum(STAGES).optional(),
  notas: z.string().trim().nullable().optional(),
});

// PATCH /api/erp/prospects/[id] — edición parcial + cambio de etapa (crm/editar)
export const PATCH = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'crm', 'editar');
  const supabase = erpClientFor(session);
  const b = Patch.parse(await req.json());

  const update: TablesUpdate<'crm_prospects'> = {};
  if (b.name !== undefined) update.name = b.name;
  if (b.contactName !== undefined) update.contact_name = b.contactName;
  if (b.phone !== undefined) update.phone = b.phone;
  if (b.email !== undefined) update.email = b.email;
  if (b.source !== undefined) update.source = b.source;
  if (b.stage !== undefined) update.stage = b.stage;
  if (b.notas !== undefined) update.notas = b.notas;

  if (Object.keys(update).length === 0) return ok({ ok: true });

  const { error } = await supabase.from('crm_prospects').update(update).eq('id', params.id);
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true });
});
