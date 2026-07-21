import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import type { PriceListRow } from '@/lib/types/erp';

export const dynamic = 'force-dynamic';

// GET /api/erp/price-lists — paginado, con conteo de items (maestros/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase
    .from('price_lists')
    .select('id, name, is_default, price_list_items ( count )', { count: 'exact' });
  if (search) q = q.ilike('name', `%${search}%`);
  const { data, error, count } = await q
    .order('is_default', { ascending: false })
    .order('name')
    .range(from, to);
  if (error) throw error;

  const rows: PriceListRow[] = (data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    isDefault: l.is_default,
    itemCount: l.price_list_items?.[0]?.count ?? 0,
  }));
  return ok(paginated(rows, page, pageSize, count));
});

const NewPriceList = z.object({
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
});

// POST /api/erp/price-lists — alta (maestros/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'crear');
  const supabase = erpClientFor(session);
  const b = NewPriceList.parse(await req.json());

  const { data, error } = await supabase
    .from('price_lists')
    .insert({
      organization_id: session.organization!.id,
      name: b.name,
      is_default: b.isDefault,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true, id: data.id }, { status: 201 });
});
