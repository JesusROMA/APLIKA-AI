import { createSupabaseServerClient } from '@/lib/supabase/server';
import { money, semaforo } from '@/lib/format';

export interface InventoryRow {
  sku: string;
  name: string;
  cat: string;
  wh: string;
  stock: number;
  min: number;
  max: number;
  price: number;
}

/**
 * Filas de inventario (variante × almacén) con join a producto y almacén.
 * RLS limita automáticamente a la organización del usuario.
 */
export async function fetchInventoryRows(opts: { status?: string; warehouse?: string } = {}): Promise<InventoryRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('inventory')
    .select(
      `stock, min_stock, max_stock,
       product_variants!inner ( sku, base_price_mxn, products!inner ( name, category ) ),
       warehouses!inner ( name )`,
    );
  if (error) throw error;

  let rows: InventoryRow[] = (data ?? []).map((r: any) => ({
    sku: r.product_variants.sku,
    name: r.product_variants.products.name,
    cat: r.product_variants.products.category ?? '',
    wh: r.warehouses.name,
    stock: r.stock,
    min: r.min_stock,
    max: r.max_stock,
    price: Number(r.product_variants.base_price_mxn),
  }));

  if (opts.warehouse && opts.warehouse !== 'todos') {
    rows = rows.filter((r) => r.wh === opts.warehouse);
  }
  if (opts.status && opts.status !== 'todos') {
    rows = rows.filter((r) => semaforo(r.stock, r.min) === opts.status);
  }
  return rows;
}

/** Resumen para los KPIs de inventario (formateado como espera la UI). */
export function summarize(rows: InventoryRow[]) {
  const valor = rows.reduce((a, r) => a + r.stock * r.price, 0);
  return {
    productos: rows.length,
    valorInventario: money(valor),
    stockBajo: rows.filter((r) => semaforo(r.stock, r.min) === 'bajo').length,
    agotados: rows.filter((r) => semaforo(r.stock, r.min) === 'agotado').length,
  };
}
