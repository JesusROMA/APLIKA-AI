import type { ErpClient } from '@/lib/erp/db';

/**
 * Resuelve el precio de una variante (F1 C1.6 / F8):
 *   1. Si viene `priceListId` (lista seleccionada en el documento) ⇒ esa lista.
 *   2. Si no, la lista del cliente (si tiene y hay item para la variante).
 *   3. Fallback: `base_price_mxn` de la variante.
 * RLS aplica sola.
 *
 * @returns precio en MXN, o `null` si la variante no existe / no es visible.
 */
export async function resolveVariantPrice(
  supabase: ErpClient,
  variantId: string,
  customerId?: string | null,
  priceListId?: string | null,
): Promise<number | null> {
  // 1) Lista explícita del documento (F8) o, en su defecto, la del cliente.
  let listId = priceListId ?? null;
  if (!listId && customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('price_list_id')
      .eq('id', customerId)
      .maybeSingle();
    listId = customer?.price_list_id ?? null;
  }
  if (listId) {
    const { data: item } = await supabase
      .from('price_list_items')
      .select('price_mxn')
      .eq('price_list_id', listId)
      .eq('product_variant_id', variantId)
      .maybeSingle();
    if (item) return Number(item.price_mxn);
  }

  // 2) Fallback al precio base de la variante
  const { data: variant } = await supabase
    .from('product_variants')
    .select('base_price_mxn')
    .eq('id', variantId)
    .maybeSingle();
  return variant ? Number(variant.base_price_mxn) : null;
}
