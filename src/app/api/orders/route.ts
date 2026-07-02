import { z } from 'zod';
import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchOrders } from '@/lib/modules/orders';

export const dynamic = 'force-dynamic';

// GET /api/orders?status={statusFilter}&search=&limit=&page=
export const GET = handle(async (req) => {
  await requireTenant();
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'todos';
  const search = url.searchParams.get('search') ?? '';
  const limit = url.searchParams.get('limit');

  const orders = await fetchOrders({
    status,
    search,
    limit: limit ? Number(limit) : undefined,
  });
  return ok({ orders, total: orders.length });
});

const NewOrder = z.object({
  customerId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  channel: z.string().default('Mostrador'),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid().optional(),
        sku: z.string().optional(),
        name: z.string().min(1),
        qty: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .min(1, 'El pedido necesita al menos un artículo'),
});

// POST /api/orders — crea un pedido en borrador (folio PD-#### autogenerado)
export const POST = handle(async (req) => {
  const ctx = await requireTenant();
  const body = NewOrder.parse(await req.json());
  const supabase = createSupabaseServerClient();

  const subtotal = body.items.reduce((a, it) => a + it.qty * it.unitPrice, 0);
  const tax = Math.round(subtotal * 0.16 * 100) / 100;
  const total = subtotal + tax;
  const itemsCount = body.items.reduce((a, it) => a + it.qty, 0);

  const { data: folioNum, error: fErr } = await supabase.rpc('next_folio', {
    p_org: ctx.organizationId,
    p_entity: 'order',
  });
  if (fErr) throw new ApiError(400, fErr.message);
  const folio = `PD-${folioNum}`;

  // Resuelve variantes por SKU para ligar las líneas al inventario
  // (sin esto, el decremento de stock al pagar no encuentra la variante).
  const skus = body.items.filter((it) => !it.variantId && it.sku).map((it) => it.sku as string);
  let bySku: Record<string, string> = {};
  if (skus.length) {
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id, sku')
      .in('sku', skus);
    bySku = Object.fromEntries((variants ?? []).map((v: any) => [v.sku, v.id]));
  }

  const { data: order, error: oErr } = await supabase
    .from('orders')
    .insert({
      organization_id: ctx.organizationId,
      folio,
      customer_id: body.customerId ?? null,
      warehouse_id: body.warehouseId ?? null,
      channel: body.channel,
      status: 'borrador',
      subtotal,
      tax,
      total,
      items_count: itemsCount,
      created_by: ctx.userId,
    })
    .select('id, folio')
    .single();
  if (oErr) throw new ApiError(400, oErr.message);

  const { error: iErr } = await supabase.from('order_items').insert(
    body.items.map((it) => ({
      organization_id: ctx.organizationId,
      order_id: order.id,
      product_variant_id: it.variantId ?? (it.sku ? bySku[it.sku] ?? null : null),
      sku: it.sku ?? null,
      name: it.name,
      qty: it.qty,
      unit_price: it.unitPrice,
      line_total: it.qty * it.unitPrice,
    })),
  );
  if (iErr) throw new ApiError(400, iErr.message);

  return ok({ ok: true, id: order.id, folio: order.folio }, { status: 201 });
});
