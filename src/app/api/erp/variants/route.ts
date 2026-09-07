import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { stockByVariant } from '@/lib/erp/products';
import type { VariantPick } from '@/lib/types/erp-ventas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/erp/variants?search=&customerId=&priceListId=&warehouseId= —
 * búsqueda de variantes con precio YA RESUELTO (lista seleccionada → lista del
 * cliente → base) + stock (del almacén indicado, o agregado). Fuente compartida
 * del DocLinesEditor (cotizaciones/pedidos/facturación). Lee maestros
 * (módulo core) ⇒ requiere sesión de tenant con 'maestros/ver'. RLS aplica sola.
 */
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'maestro_productos', 'ver');
  const supabase = erpClientFor(session);

  const url = new URL(req.url);
  const search = (url.searchParams.get('search') ?? '').trim();
  const customerId = url.searchParams.get('customerId');
  const priceListParam = url.searchParams.get('priceListId');
  const warehouseId = url.searchParams.get('warehouseId');

  let q = supabase
    .from('product_variants')
    .select('id, sku, name, base_price_mxn, products ( name, iva_rate )')
    .limit(20);
  if (search) q = q.or(`sku.ilike.%${search}%,name.ilike.%${search}%`);
  const { data, error } = await q.order('sku');
  if (error) throw error;

  const variants = (data ?? []) as unknown as {
    id: string;
    sku: string;
    name: string;
    base_price_mxn: number;
    products: { name: string; iva_rate: number } | null;
  }[];
  const ids = variants.map((v) => v.id);

  // Precio por lista: la SELECCIONADA en el documento (F8) manda; si no viene,
  // la lista del cliente. Fallback: precio base.
  const listPrice = new Map<string, number>();
  let priceListId = priceListParam ?? null;
  if (!priceListId && customerId) {
    const { data: cust } = await supabase
      .from('customers')
      .select('price_list_id')
      .eq('id', customerId)
      .maybeSingle();
    priceListId = cust?.price_list_id ?? null;
  }
  if (priceListId && ids.length) {
    const { data: items } = await supabase
      .from('price_list_items')
      .select('product_variant_id, price_mxn')
      .eq('price_list_id', priceListId)
      .in('product_variant_id', ids);
    for (const it of items ?? []) listPrice.set(it.product_variant_id, Number(it.price_mxn));
  }

  // Stock: del almacén indicado (disponibilidad real al cotizar) o agregado.
  let stock: Record<string, number>;
  if (warehouseId && ids.length) {
    const { data: inv } = await supabase
      .from('inventory')
      .select('product_variant_id, stock')
      .eq('warehouse_id', warehouseId)
      .in('product_variant_id', ids);
    stock = {};
    for (const r of inv ?? []) stock[r.product_variant_id] = Number(r.stock);
  } else {
    stock = await stockByVariant(supabase, ids);
  }
  const rows: VariantPick[] = variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    productName: v.products?.name ?? v.name,
    price: listPrice.get(v.id) ?? Number(v.base_price_mxn),
    ivaRate: Number(v.products?.iva_rate ?? 0.16),
    stockTotal: stock[v.id] ?? 0,
  }));

  return ok({ data: rows });
});
