import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
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

// GET /api/erp/prospects — listado paginado (crm/ver); ?status=<etapa> filtra
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'crm', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('crm_prospects').select(SELECT, { count: 'exact' });
  if (search) q = q.ilike('name', `%${search}%`);
  if (status) {
    if (!(STAGES as readonly string[]).includes(status)) {
      throw new ApiError(422, `Etapa inválida: ${status}`);
    }
    q = q.eq('stage', status as ProspectStage);
  }
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, to);
  if (error) throw error;

  const rows = (data ?? []).map(toRow);
  return ok(paginated(rows, page, pageSize, count));
});

const NewProspect = z.object({
  name: z.string().min(1),
  contactName: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().email().nullable().optional(),
  source: z.string().trim().nullable().optional(),
  stage: z.enum(STAGES).default('nuevo'),
  notas: z.string().trim().nullable().optional(),
});

// POST /api/erp/prospects — alta (crm/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'crm', 'crear');
  const supabase = erpClientFor(session);
  const b = NewProspect.parse(await req.json());

  const { data, error } = await supabase
    .from('crm_prospects')
    .insert({
      organization_id: session.organization!.id,
      name: b.name,
      contact_name: b.contactName ?? null,
      phone: b.phone ?? null,
      email: b.email ?? null,
      source: b.source ?? null,
      stage: b.stage,
      notas: b.notas ?? null,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true, id: data.id }, { status: 201 });
});
