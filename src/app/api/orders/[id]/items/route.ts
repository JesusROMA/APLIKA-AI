import { handle, ok, ApiError } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { money } from '@/lib/format';
import { ORDER_LABEL } from '@/lib/modules/orders';

export const dynamic = 'force-dynamic';

// GET /api/orders/{id}/items — admite UUID o folio (PD-####). Devuelve líneas + totales.
export const GET = handle(async (_req, { params }) => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const key = decodeURIComponent(params.id);
  const isUuid = /^[0-9a-f-]{36}$/i.test(key);

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, folio, status, channel, subtotal, tax, total, customers ( name, rfc )')
    .eq(isUuid ? 'id' : 'folio', key)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new ApiError(404, 'Pedido no encontrado');

  const { data: items } = await supabase
    .from('order_items')
    .select('name, sku, qty, unit_price, line_total')
    .eq('order_id', (order as any).id);

  const lines = (items ?? []).map((l: any) => ({
    name: l.name,
    sku: l.sku ?? '',
    qty: l.qty,
    price: money(Number(l.unit_price)),
    total: money(Number(l.line_total)),
  }));

  const o: any = order;
  return ok({
    folio: o.folio,
    status: o.status,
    statusLabel: ORDER_LABEL[o.status] ?? o.status,
    client: o.customers?.name ?? '—',
    rfc: o.customers?.rfc ?? '',
    channel: o.channel ?? '',
    lines,
    subtotal: money(Number(o.subtotal)),
    iva: money(Number(o.tax)),
    total: money(Number(o.total)),
  });
});
