import type { ErpClient } from '@/lib/erp/db';

/**
 * Resuelve el precio de una variante para un cliente (C1.6 / C3):
 *   1. Si el cliente tiene lista de precios y hay item para la variante ⇒ ese precio.
 *   2. Si no ⇒ `base_price_mxn` de la variante.
 *
 * DESVIACIÓN CONTROLADA (reportada): en F0 el POST de pedidos vive en el panel
 * dc (`/api/orders`) y NO se toca para no romperlo. Este helper deja la lógica
 * lista para que F1 la use en el nuevo `/api/erp/orders`. RLS aplica sola.
 *
 * @returns precio en MXN, o `null` si la variante no existe / no es visible.
 */
export async function resolveVariantPrice(
  supabase: ErpClient,
  variantId: string,
  customerId?: string | null,
): Promise<number | null> {
  // 1) Lista del cliente
  if (customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('price_list_id')
      .eq('id', customerId)
      .maybeSingle();

    const priceListId = customer?.price_list_id ?? null;
    if (priceListId) {
      const { data: item } = await supabase
        .from('price_list_items')
        .select('price_mxn')
        .eq('price_list_id', priceListId)
        .eq('product_variant_id', variantId)
        .maybeSingle();
      if (item) return Number(item.price_mxn);
    }
  }

  // 2) Fallback al precio base de la variante
  const { data: variant } = await supabase
    .from('product_variants')
    .select('base_price_mxn')
    .eq('id', variantId)
    .maybeSingle();
  return variant ? Number(variant.base_price_mxn) : null;
}
