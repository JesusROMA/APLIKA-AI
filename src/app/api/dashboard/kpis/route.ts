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
  citas: 'M4 5H20V20H4ZM4 9H20M8 3.5V6.5M16 3.5V6.5',
  pacientes: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3.3 2.7-5 6-5s6 1.7 6 5',
};

// KPIs de agenda para el vertical servicios_agenda (consultorios)
async function agendaKpis(supabase: any, since: string) {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

  const [{ data: hoy }, { data: semana }, { data: pacientes }, { data: reservasIa }, { data: pagosMes }, { data: draftInv }, { data: cust }] =
    await Promise.all([
      supabase.from('appointments').select('id, status').gte('starts_at', dayStart).lt('starts_at', dayEnd).neq('status', 'cancelada'),
      supabase.from('appointments').select('id').gte('starts_at', dayStart).lt('starts_at', weekEnd).neq('status', 'cancelada'),
      supabase.from('customers').select('id'),
      supabase.from('ai_conversations').select('id').eq('appointment', true),
      supabase.from('payments').select('amount').eq('status', 'exitoso').gte('created_at', since),
      supabase.from('invoices').select('id').eq('status', 'borrador'),
      supabase.from('customers').select('balance'),
    ]);

  const confirmadas = (hoy ?? []).filter((a: any) => a.status === 'confirmada').length;
  // Ocupación: citas de los próximos 7 días sobre ~8 espacios diarios hábiles
  const ocupacion = Math.min(100, Math.round(((semana ?? []).length / (8 * 6)) * 100));
  const ingresos = (pagosMes ?? []).reduce((a: number, p: any) => a + Number(p.amount), 0);
  const cobranza = (cust ?? []).reduce((a: number, c: any) => a + Number(c.balance), 0);

  return [
    { label: 'Citas hoy', value: String((hoy ?? []).length), delta: `${confirmadas} confirmadas`, tone: 'up', d: ICON.citas },
    { label: 'Pacientes activos', value: String((pacientes ?? []).length), delta: 'en el consultorio', tone: 'up', d: ICON.pacientes },
    { label: 'Ocupación de agenda', value: `${ocupacion}%`, delta: 'próximos 7 días', tone: 'up', d: ICON.ventas },
    { label: 'Reservas por IA', value: String((reservasIa ?? []).length), delta: 'por WhatsApp', tone: 'up', d: ICON.ia },
    { label: 'Ingresos del mes', value: money(ingresos), delta: 'pagos exitosos', tone: 'up', d: ICON.ticket },
    { label: 'Facturas por timbrar', value: String((draftInv ?? []).length), delta: 'CFDI 4.0 pendientes', tone: 'info', d: ICON.facturas },
    { label: 'Cobranza', value: money(cobranza), delta: 'saldo por cobrar', tone: 'neutral', d: ICON.cobranza },
  ];
}

// GET /api/dashboard/kpis?period=30d
export const GET = handle(async (req) => {
  const ctx = await requireTenant();
  const supabase = createSupabaseServerClient();
  const url = new URL(req.url);
  const days = Number((url.searchParams.get('period') ?? '30d').replace('d', '')) || 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Vertical del tenant: consultorios ven KPIs de agenda, no de inventario.
  if (ctx.organizationId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('verticals ( key )')
      .eq('id', ctx.organizationId)
      .maybeSingle();
    if ((org as any)?.verticals?.key === 'servicios_agenda') {
      return ok({ kpis: await agendaKpis(supabase, since) });
    }
  }

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
