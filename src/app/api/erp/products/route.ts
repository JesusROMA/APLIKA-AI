import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import {
  PRODUCT_SELECT,
  stockByVariant,
  toProductRow,
  type RawProduct,
} from '@/lib/erp/products';
import type { Json } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

// GET /api/erp/products — paginado, con variantes + stock agregado (maestros/ver)
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'ver');
  const supabase = erpClientFor(session);

  const { page, pageSize, search, status } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  let q = supabase.from('products').select(PRODUCT_SELECT, { count: 'exact' });
  if (search) q = q.ilike('name', `%${search}%`);
  if (status === 'producto' || status === 'servicio') q = q.eq('tipo', status);
  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const products = (data ?? []) as unknown as RawProduct[];
  const variantIds = products.flatMap((p) => (p.product_variants ?? []).map((v) => v.id));
  const stock = await stockByVariant(supabase, variantIds);
  const rows = products.map((p) => toProductRow(p, stock));

  return ok(paginated(rows, page, pageSize, count));
});

const NewVariant = z.object({
  sku: z.string().min(1),
  name: z.string().optional(),
  basePriceMxn: z.number().nonnegative().default(0),
  claveUnidad: z.string().min(1).optional(), // SAT c_ClaveUnidad; default BD 'H87'
  attributes: z.record(z.unknown()).optional(),
});

const NewProduct = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional(),
  tipo: z.enum(['producto', 'servicio']).default('producto'),
  claveProdServ: z.string().optional(),
  ivaRate: z.number().min(0).max(1).optional(),
  variants: z.array(NewVariant).min(1, 'El producto necesita al menos una variante'),
});

// POST /api/erp/products — crea producto + variante(s) (maestros/crear)
export const POST = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'crear');
  const supabase = erpClientFor(session);
  const b = NewProduct.parse(await req.json());
  const orgId = session.organization!.id;

  const { data: product, error: pErr } = await supabase
    .from('products')
    .insert({
      organization_id: orgId,
      name: b.name,
      category: b.category ?? null,
      description: b.description ?? null,
      tipo: b.tipo,
      clave_prod_serv: b.claveProdServ ?? null,
      ...(b.ivaRate !== undefined ? { iva_rate: b.ivaRate } : {}),
    })
    .select('id')
    .single();
  if (pErr) throw new ApiError(400, pErr.message);

  const { error: vErr } = await supabase.from('product_variants').insert(
    b.variants.map((v) => ({
      organization_id: orgId,
      product_id: product.id,
      sku: v.sku,
      name: v.name ?? b.name,
      base_price_mxn: v.basePriceMxn,
      ...(v.claveUnidad ? { clave_unidad: v.claveUnidad } : {}),
      // attributes es JSON de usuario (custom fields C1.5); cast justificado.
      ...(v.attributes ? { attributes: v.attributes as Json } : {}),
    })),
  );
  if (vErr) throw new ApiError(400, vErr.message);

  return ok({ ok: true, id: product.id }, { status: 201 });
});
