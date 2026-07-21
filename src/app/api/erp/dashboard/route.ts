import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireModule, requirePerm } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { semaforo } from '@/lib/format';
import type { DashboardData, DashboardKpi, ModuleKey } from '@/lib/types/erp';

export const dynamic = 'force-dynamic';

interface RawInventory {
  stock: number;
  min_stock: number;
  product_variants: {
    sku: string;
    products: { name: string } | null;
  } | null;
}

// GET /api/erp/dashboard — KPIs limpios (números, sin SVG/labels preformateados)
// según los módulos activos del tenant (C2 DashboardData).
export const GET = handle(async () => {
  const session = await getErpSession();
  requireModule(session, 'dashboard');
  requirePerm(session, 'dashboard', 'ver');
  const supabase = erpClientFor(session);

  const days = 30;
  const startMs = Date.now() - days * 86400000;
  const since = new Date(startMs).toISOString();
  const has = (k: ModuleKey) => session.modules.some((m) => m.key === k);

  const kpis: DashboardKpi[] = [];
  const out: DashboardData = { kpis };

  if (has('ordenes')) {
    const [{ data: ordersPeriod }, { data: pending }, { data: aiOrders }] = await Promise.all([
      supabase.from('orders').select('total, created_at').gte('created_at', since).neq('status', 'cancelada'),
      supabase.from('orders').select('id').in('status', ['borrador', 'confirmado', 'pagado', 'surtido']),
      supabase.from('orders').select('id').ilike('channel', '%Agente IA%'),
    ]);
    const rows = ordersPeriod ?? [];
    const ventas = rows.reduce((a, o) => a + Number(o.total), 0);
    const n = rows.length;
    kpis.push({ key: 'ventas_periodo', label: 'Ventas del periodo', value: Math.round(ventas), unit: 'mxn' });
    kpis.push({ key: 'ticket_promedio', label: 'Ticket promedio', value: n ? Math.round(ventas / n) : 0, unit: 'mxn' });
    kpis.push({ key: 'pedidos_pendientes', label: 'Pedidos pendientes', value: (pending ?? []).length, unit: 'count' });
    kpis.push({ key: 'pedidos_ia', label: 'Pedidos por IA', value: (aiOrders ?? []).length, unit: 'count' });

    // Serie diaria de ventas (números limpios; la UI decide el trazo)
    const buckets = new Array(days).fill(0) as number[];
    for (const o of rows) {
      const idx = Math.min(days - 1, Math.floor((new Date(o.created_at).getTime() - startMs) / 86400000));
      if (idx >= 0) buckets[idx] += Number(o.total);
    }
    out.salesTrend = buckets.map((total, i) => ({
      date: new Date(startMs + i * 86400000).toISOString().slice(0, 10),
      total: Math.round(total),
    }));
  }

  if (has('inventario')) {
    const { data: inv } = await supabase
      .from('inventory')
      .select('stock, min_stock, product_variants ( sku, products ( name ) )');
    const invRows = (inv ?? []) as unknown as RawInventory[];
    const low = invRows.filter((r) => semaforo(r.stock, r.min_stock) !== 'ok');
    kpis.push({ key: 'stock_bajo', label: 'Stock bajo', value: low.length, unit: 'count' });
    out.stockAlerts = low.map((r) => ({
      sku: r.product_variants?.sku ?? '',
      name: r.product_variants?.products?.name ?? '',
      stock: r.stock,
      minStock: r.min_stock,
    }));
  }

  if (has('facturacion')) {
    const { data: draftInv } = await supabase.from('invoices').select('id').eq('status', 'borrador');
    kpis.push({ key: 'facturas_por_timbrar', label: 'Facturas por timbrar', value: (draftInv ?? []).length, unit: 'count' });
  }

  if (has('pagos')) {
    const [{ data: pagosMes }, { data: cust }] = await Promise.all([
      supabase.from('payments').select('amount').eq('status', 'exitoso').gte('created_at', since),
      supabase.from('customers').select('balance'),
    ]);
    const ingresos = (pagosMes ?? []).reduce((a, p) => a + Number(p.amount), 0);
    const cobranza = (cust ?? []).reduce((a, c) => a + Number(c.balance), 0);
    kpis.push({ key: 'ingresos_periodo', label: 'Ingresos del periodo', value: Math.round(ingresos), unit: 'mxn' });
    kpis.push({ key: 'cobranza', label: 'Cobranza', value: Math.round(cobranza), unit: 'mxn' });
  }

  if (has('calendario')) {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const { data: appts } = await supabase
      .from('appointments')
      .select('id, starts_at, patient_name, status')
      .gte('starts_at', dayStart)
      .lt('starts_at', dayEnd)
      .neq('status', 'cancelada')
      .order('starts_at');
    const list = appts ?? [];
    kpis.push({ key: 'citas_hoy', label: 'Citas hoy', value: list.length, unit: 'count' });
    out.todayAppointments = list.map((a) => ({
      id: a.id,
      startsAt: a.starts_at,
      patientName: a.patient_name,
      status: a.status,
    }));
  }

  return ok(out);
});
