import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchInventoryRows } from '@/lib/modules/inventory';

export const dynamic = 'force-dynamic';

// GET /api/inventory/products?status={invFilter}&warehouse=
export const GET = handle(async (req) => {
  await requireTenant();
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'todos';
  const warehouse = url.searchParams.get('warehouse') ?? 'todos';
  const products = await fetchInventoryRows({ status, warehouse });
  return ok({ products });
});

const NewProduct = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  sku: z.string().min(1),
  price: z.number().nonnegative(),
  warehouseId: z.string().uuid(),
  stock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(0).default(0),
  maxStock: z.number().int().min(0).default(0),
});

// POST /api/inventory/products — alta de producto + variante + inventario inicial
export const POST = handle(async (req) => {
  const ctx = await requireTenant();
  const body = NewProduct.parse(await req.json());
  const supabase = createSupabaseServerClient();

  const { data: product, error: pErr } = await supabase
    .from('products')
    .insert({ organization_id: ctx.organizationId, name: body.name, category: body.category })
    .select('id')
    .single();
  if (pErr) throw new ApiError(400, pErr.message);

  const { data: variant, error: vErr } = await supabase
    .from('product_variants')
    .insert({
      organization_id: ctx.organizationId,
      product_id: product.id,
      sku: body.sku,
      name: body.name,
      base_price_mxn: body.price,
    })
    .select('id')
    .single();
  if (vErr) throw new ApiError(400, vErr.message);

  // Crea la fila de inventario en 0; el stock inicial entra vía adjust_inventory
  // para que quede registrado en el kardex (evita doble conteo).
  const { error: iErr } = await supabase.from('inventory').insert({
    organization_id: ctx.organizationId,
    product_variant_id: variant.id,
    warehouse_id: body.warehouseId,
    stock: 0,
    min_stock: body.minStock,
    max_stock: body.maxStock,
  });
  if (iErr) throw new ApiError(400, iErr.message);

  if (body.stock > 0) {
    await supabase.rpc('adjust_inventory', {
      p_variant: variant.id,
      p_warehouse: body.warehouseId,
      p_qty: body.stock,
      p_type: 'entrada',
      p_reason: 'Alta de producto',
      p_ref_type: 'adjustment',
    });
  }

  return ok({ ok: true, productId: product.id, variantId: variant.id }, { status: 201 });
});
