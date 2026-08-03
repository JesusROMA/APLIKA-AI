import { z } from 'zod';
import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import type { AuditRow } from '@/lib/types/erp-config';

export const dynamic = 'force-dynamic';

/**
 * Filtros opcionales de la bitácora (además de page/pageSize de parseListParams).
 * La confidencialidad la impone la RLS de `audit_log` (SELECT sólo super_admin
 * o tenant_admin de la org, 0010); el gate del endpoint es `config/ver`.
 */
const filtersSchema = z.object({
  entityType: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  action: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from inválido (YYYY-MM-DD)')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to inválido (YYYY-MM-DD)')
    .optional(),
});

// La FK `audit_log_actor_id_fkey` → profiles existe (verificada en
// database.types.ts): usamos el embed para resolver el nombre del actor.
const SELECT =
  'id, actor_id, entity_type, entity_id, action, detail, created_at, profiles!audit_log_actor_id_fkey ( full_name )';

type AuditRecord = {
  id: number;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  detail: unknown;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

function toRow(r: AuditRecord): AuditRow {
  return {
    id: r.id,
    actorId: r.actor_id,
    actorName: r.profiles?.full_name ?? null,
    entityType: r.entity_type,
    entityId: r.entity_id,
    action: r.action,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
  };
}

// GET /api/erp/audit — bitácora paginada bajo RLS (config/ver).
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'config', 'ver');
  const supabase = erpClientFor(session);

  const url = new URL(req.url);
  const { page, pageSize } = parseListParams(url);
  const { entityType, action, from: fromDate, to: toDate } = filtersSchema.parse(
    Object.fromEntries(url.searchParams),
  );
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('audit_log').select(SELECT, { count: 'exact' });
  if (entityType) q = q.eq('entity_type', entityType);
  if (action) q = q.eq('action', action);
  if (fromDate) q = q.gte('created_at', `${fromDate}T00:00:00`);
  // `to` inclusivo: hasta el final del día indicado.
  if (toDate) q = q.lte('created_at', `${toDate}T23:59:59.999`);

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = ((data ?? []) as unknown as AuditRecord[]).map(toRow);
  return ok(paginated(rows, page, pageSize, count));
});
