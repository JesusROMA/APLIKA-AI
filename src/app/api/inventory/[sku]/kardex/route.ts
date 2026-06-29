import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { dateLong, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TIPO: Record<string, string> = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' };

// GET /api/inventory/{sku}/kardex — detalle del producto + kardex de movimientos
export const GET = handle(async (_req, { params }) => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const sku = decodeURIComponent(params.sku);

  const { data: variant, error } = await supabase
    .from('product_variants')
    .select('id, sku, name, base_price_mxn, products!inner ( name, category )')
    .eq('sku', sku)
    .maybeSingle();
  if (error) throw error;
  if (!variant) throw new ApiError(404, 'Producto no encontrado');

  const { data: inv } = await supabase
    .from('inventory')
    .select('stock, min_stock, max_stock, warehouses!inner ( name )')
    .eq('product_variant_id', (variant as any).id);

  const almacenes = (inv ?? []).map((r: any) => ({ name: r.warehouses.name, qty: `${r.stock} u` }));
  const stock = (inv ?? []).reduce((a: number, r: any) => a + r.stock, 0);
  const min = (inv ?? []).reduce((a: number, r: any) => Math.max(a, r.min_stock), 0);
  const max = (inv ?? []).reduce((a: number, r: any) => Math.max(a, r.max_stock), 0);
  const price = Number((variant as any).base_price_mxn);

  const { data: moves } = await supabase
    .from('inventory_movements')
    .select('type, qty, reason, created_at')
    .eq('product_variant_id', (variant as any).id)
    .order('created_at', { ascending: false })
    .limit(20);

  const kardex = (moves ?? []).map((m: any) => ({
    date: dateLong(m.created_at),
    tipo: TIPO[m.type] ?? m.type,
    detail: m.reason ?? '',
    qty: (m.qty > 0 ? '+' : '') + m.qty,
    kind: m.type,
  }));

  return ok({
    product: {
      sku: (variant as any).sku,
      name: (variant as any).products.name,
      cat: (variant as any).products.category ?? '',
      stock,
      min,
      max,
      price,
      valor: money(stock * price),
      almacenes,
    },
    kardex,
  });
});
