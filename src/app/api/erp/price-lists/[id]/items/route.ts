import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { parseListParams, rangeFor, paginated } from '@/lib/erp/pagination';
import type { PriceListItemRow } from '@/lib/types/erp';

export const dynamic = 'force-dynamic';

const ITEM_SELECT =
  'product_variant_id, price_mxn, product_variants ( sku, name, products ( name ) )';

interface RawItem {
  product_variant_id: string;
  price_mxn: number;
  product_variants: {
    sku: string;
    name: string;
    products: { name: string } | null;
  } | null;
}

/** Verifica que la lista exista y sea visible bajo RLS; 404 si no. */
async function ensurePriceList(
  supabase: ReturnType<typeof erpClientFor>,
  id: string,
): Promise<void> {
  const { data, error } = await supabase.from('price_lists').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError(404, 'Lista de precios no encontrada');
}

// GET /api/erp/price-lists/[id]/items — items paginados (maestros/ver)
export const GET = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'ver');
  const supabase = erpClientFor(session);
  await ensurePriceList(supabase, params.id);

  const { page, pageSize, search } = parseListParams(new URL(req.url));
  const [from, to] = rangeFor(page, pageSize);

  const { data, error, count } = await supabase
    .from('price_list_items')
    .select(ITEM_SELECT, { count: 'exact' })
    .eq('price_list_id', params.id)
    .range(from, to);
  if (error) throw error;

  const raw = (data ?? []) as unknown as RawItem[];
  let rows: PriceListItemRow[] = raw.map((r) => ({
    productVariantId: r.product_variant_id,
    sku: r.product_variants?.sku ?? '',
    productName: r.product_variants?.products?.name ?? r.product_variants?.name ?? '',
    priceMxn: Number(r.price_mxn),
  }));
  // Búsqueda por SKU/nombre (post-filtro; el join impide filtrar en SQL directo).
  if (search) {
    const needle = search.toLowerCase();
    rows = rows.filter(
      (r) => r.sku.toLowerCase().includes(needle) || r.productName.toLowerCase().includes(needle),
    );
  }
  return ok(paginated(rows, page, pageSize, search ? rows.length : count));
});

const PutItems = z.object({
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        priceMxn: z.number().nonnegative(),
      }),
    )
    .max(2000),
});

// PUT /api/erp/price-lists/[id]/items — reemplaza (upsert masivo) (maestros/editar)
// DESVIACIÓN (reportada): la RLS de C1.2 restringe DELETE a super_admin, así que
// no se puede "borrar y reinsertar". Se implementa como UPSERT por
// (price_list_id, product_variant_id): agrega/actualiza los items enviados; los
// omitidos conservan su precio. Ver README.
export const PUT = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'editar');
  const supabase = erpClientFor(session);
  await ensurePriceList(supabase, params.id);
  const b = PutItems.parse(await req.json());

  if (b.items.length === 0) return ok({ ok: true, upserted: 0 });

  const rows = b.items.map((it) => ({
    organization_id: session.organization!.id,
    price_list_id: params.id,
    product_variant_id: it.productVariantId,
    price_mxn: it.priceMxn,
  }));

  const { error } = await supabase
    .from('price_list_items')
    .upsert(rows, { onConflict: 'price_list_id,product_variant_id' });
  if (error) throw new ApiError(400, error.message);
  return ok({ ok: true, upserted: rows.length });
});
