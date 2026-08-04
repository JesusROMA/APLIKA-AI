import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
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

// GET /api/erp/price-lists/[id]/items — TODOS los items de la lista (maestros/ver).
// Devuelve un arreglo (el editor necesita el set completo, no paginado).
export const GET = handle(async (_req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'ver');
  const supabase = erpClientFor(session);
  await ensurePriceList(supabase, params.id);

  const { data, error } = await supabase
    .from('price_list_items')
    .select(ITEM_SELECT)
    .eq('price_list_id', params.id);
  if (error) throw error;

  const raw = (data ?? []) as unknown as RawItem[];
  const rows: PriceListItemRow[] = raw
    .map((r) => ({
      productVariantId: r.product_variant_id,
      sku: r.product_variants?.sku ?? '',
      productName: r.product_variants?.products?.name ?? r.product_variants?.name ?? '',
      priceMxn: Number(r.price_mxn),
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
  return ok(rows);
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

// PUT /api/erp/price-lists/[id]/items — REEMPLAZO real (maestros/editar).
// Vía RPC replace_price_list_items: agrega/actualiza los enviados y ELIMINA los
// que ya no están (el borrado directo lo bloquea la RLS; el RPC es SECURITY
// DEFINER con chequeo de permiso). "Lo que ves es lo que se guarda".
export const PUT = handle(async (req, { params }) => {
  const session = await getErpSession();
  requireAccess(session, 'maestros', 'editar');
  const supabase = erpClientFor(session);
  await ensurePriceList(supabase, params.id);
  const b = PutItems.parse(await req.json());

  const { data, error } = await supabase.rpc('replace_price_list_items', {
    p_list: params.id,
    p_items: b.items.map((it) => ({
      productVariantId: it.productVariantId,
      priceMxn: it.priceMxn,
    })),
  });
  if (error) {
    if (error.code === '42501') throw new ApiError(403, 'Sin permiso: maestros/editar');
    throw new ApiError(400, error.message);
  }
  return ok({ ok: true, count: data ?? 0 });
});
