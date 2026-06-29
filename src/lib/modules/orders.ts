import { createSupabaseServerClient } from '@/lib/supabase/server';
import { money, dateLong } from '@/lib/format';

// Estados que renderiza la UI (labels exactos) y pipeline.
export const ORDER_PIPELINE = [
  'borrador',
  'confirmado',
  'pagado',
  'surtido',
  'facturado',
  'enviado',
] as const;

export const ORDER_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  pagado: 'Pagado',
  surtido: 'Surtido',
  facturado: 'Facturado',
  enviado: 'Enviado',
  cancelada: 'Cancelada',
};

export interface OrderRow {
  folio: string;
  client: string;
  rfc: string;
  date: string;
  items: number;
  totalNum: number;
  status: string; // valor del enum (la UI deriva label/badge)
  channel: string;
}

/**
 * Lista de pedidos del tenant con join al cliente. RLS limita a la organización.
 * Devuelve la forma cruda que el frontend (this.ventas) ya sabe renderizar.
 */
export async function fetchOrders(opts: {
  status?: string;
  search?: string;
  limit?: number;
} = {}): Promise<OrderRow[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from('orders')
    .select('folio, status, channel, total, items_count, created_at, customers ( name, rfc )')
    .order('created_at', { ascending: false });

  if (opts.status && opts.status !== 'todos') query = query.eq('status', opts.status);
  if (opts.limit) query = query.limit(opts.limit);

  const { data, error } = await query;
  if (error) throw error;

  let rows: OrderRow[] = (data ?? []).map((o: any) => ({
    folio: o.folio,
    client: o.customers?.name ?? '—',
    rfc: o.customers?.rfc ?? '',
    date: dateLong(o.created_at),
    items: o.items_count,
    totalNum: Number(o.total),
    status: o.status,
    channel: o.channel ?? '',
  }));

  if (opts.search) {
    const q = opts.search.toLowerCase();
    rows = rows.filter((r) => r.folio.toLowerCase().includes(q) || r.client.toLowerCase().includes(q));
  }
  return rows;
}

/** Formato para la tabla "Pedidos recientes" del dashboard. */
export function toRecent(rows: OrderRow[]) {
  return rows.map((r) => ({
    folio: r.folio,
    client: r.client,
    date: r.date,
    total: money(r.totalNum),
    status: ORDER_LABEL[r.status] ?? r.status,
    statusKey: r.status,
  }));
}
