import { handle, ok } from '@/lib/api';
import { requireTenant } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { money, semaforo } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Iconos/tono replican la definición del Panel Cliente (this.kpis) para que el
// frontend solo reemplace el arreglo sin cambiar plantillas.
const ICON = {
  ventas: 'M4 19V5M4 19h16M8 15l3-4 3 2 4-6',
  ticket: 'M7 3h10v18l-5-3-5 3zM9 8h6M9 12h6',
  pendientes: 'M6 7h12l-1 13H7zM9 7V5a3 3 0 0 1 6 0v2',
  stock: 'M12 9v4M12 16v.01M10.3 4.3 3 18a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z',
  facturas: 'M7 3h8l3 3v15l-2-1-2 1-2-1-2 1-2-1-2 1V3zM9 9h6M9 12h4',
  cobranza: 'M3 7h18v10H3zM3 11h18M16 15h2',
  ia: 'M5 5h14v10H8l-3 3zM9 10h.01M13 10h.01',
};

// GET /api/dashboard/kpis?period=30d
export const GET = handle(async (req) => {
  await requireTenant();
  const supabase = createSupabaseServerClient();
  const url = new URL(req.url);
  const days = Number((url.searchParams.get('period') ?? '30d').replace('d', '')) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [{ data: ordersPeriod }, { data: pending }, { data: inv }, { data: draftInv }, { data: cust }, { data: aiOrders }] =
    await Promise.all([
      supabase.from('orders').select('total').gte('created_at', since).neq('status', 'cancelada'),
      supabase.from('orders').select('id').in('status', ['borrador', 'confirmado', 'pagado', 'surtido']),
      supabase.from('inventory').select('stock, min_stock'),
      supabase.from('invoices').select('id').eq('status', 'borrador'),
      supabase.from('customers').select('balance'),
      supabase.from('orders').select('id').ilike('channel', '%Agente IA%'),
    ]);

  const ventas = (ordersPeriod ?? []).reduce((a: number, o: any) => a + Number(o.total), 0);
  const nOrders = (ordersPeriod ?? []).length;
  const ticket = nOrders ? ventas / nOrders : 0;
  const stockBajo = (inv ?? []).filter((r: any) => semaforo(r.stock, r.min_stock) !== 'ok').length;
  const cobranza = (cust ?? []).reduce((a: number, c: any) => a + Number(c.balance), 0);

  const kpis = [
    { label: 'Ventas del periodo', value: money(ventas), delta: `${nOrders} pedidos`, tone: 'up', d: ICON.ventas },
    { label: 'Ticket promedio', value: money(ticket), delta: 'por pedido', tone: 'up', d: ICON.ticket },
    { label: 'Pedidos pendientes', value: String((pending ?? []).length), delta: 'por procesar', tone: 'neutral', d: ICON.pendientes },
    { label: 'Stock bajo', value: String(stockBajo), delta: 'por reordenar', tone: 'warn', d: ICON.stock },
    { label: 'Facturas por timbrar', value: String((draftInv ?? []).length), delta: 'CFDI 4.0 pendientes', tone: 'info', d: ICON.facturas },
    { label: 'Cobranza', value: money(cobranza), delta: 'saldo por cobrar', tone: 'neutral', d: ICON.cobranza },
    { label: 'Pedidos por IA', value: String((aiOrders ?? []).length), delta: 'este mes', tone: 'up', d: ICON.ia },
  ];

  return ok({ kpis });
});
