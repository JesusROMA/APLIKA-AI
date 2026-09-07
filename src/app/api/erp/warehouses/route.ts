import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import type { WarehouseRow } from '@/lib/types/erp';

export const dynamic = 'force-dynamic';

// GET /api/erp/warehouses — paginado (maestros/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestro_almacenes', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('warehouses').select('id, name, code, is_default', { count: 'exact' });
  if (search) q = q.ilike('name', `%${search}%`);
  const { data, error, count } = await q
    .order('is_default', { ascending: false })
    .order('name')
    .range(from, to);
  if (error) throw error;

  const rows: WarehouseRow[] = (data ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    code: w.code,
    isDefault: w.is_default,
  }));
  return ok(paginated(rows, page, pageSize, count));
});

const NewWarehouse = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  isDefault: z.boolean().default(false),
});

// POST /api/erp/warehouses — alta (maestros/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestro_almacenes', 'crear');
  const supabase = erpClientFor(session);
  const b = NewWarehouse.parse(await req.json());

  const { data, error } = await supabase
    .from('warehouses')
    .insert({
      organization_id: session.organization!.id,
      name: b.name,
      code: b.code ?? null,
      is_default: b.isDefault,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true, id: data.id }, { status: 201 });
});
