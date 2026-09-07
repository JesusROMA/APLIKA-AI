import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireModule, requirePerm } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import { semaforo } from '@/lib/format';
import type { AgingBucket, DashboardData, ModuleKey, StatDelta } from '@/lib/types/erp';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;
const RANGES = new Set([7, 30, 90]);

interface RawInventory {
  stock: number;
  min_stock: number;
  avg_cost: number;
  product_variant_id: string;
  product_variants: {
    sku: string;
    products: { name: string } | null;
  } | null;
}

/** yyyy-mm-dd en hora local del servidor (consistente con el resto del ERP). */
function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function deltaOf(current: number, base: number, vs: string): StatDelta {
  if (base <= 0) {
    return { pct: null, direction: current > 0 ? 'up' : 'flat', vs };
  }
  const pct = ((current - base) / base) * 100;
  const direction = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  return { pct: Math.round(pct * 10) / 10, direction, vs };
}

function agingOf(rows: { saldo: number; base: string | null }[]): {
  total: number;
  facturas: number;
  vencido31: number;
  aging: AgingBucket[];
} {
  const buckets: AgingBucket[] = [
    { bucket: '0-30', monto: 0, facturas: 0 },
    { bucket: '31-60', monto: 0, facturas: 0 },
    { bucket: '61-90', monto: 0, facturas: 0 },
    { bucket: '90+', monto: 0, facturas: 0 },
  ];
  const now = Date.now();
  let total = 0;
  for (const r of rows) {
    const ms = r.base ? new Date(r.base).getTime() : NaN;
    const days = Number.isNaN(ms) ? 0 : Math.max(0, Math.floor((now - ms) / DAY_MS));
    const idx = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
    buckets[idx].monto += r.saldo;
    buckets[idx].facturas += 1;
    total += r.saldo;
  }
  for (const b of buckets) b.monto = Math.round(b.monto);
  const vencido31 = buckets[1].monto + buckets[2].monto + buckets[3].monto;
  return { total: Math.round(total), facturas: rows.length, vencido31, aging: buckets };
}

// GET /api/erp/dashboard?days=7|30|90 — agregados del negocio para el resumen:
// hoy/mes con delta, margen del mes, cartera (CxC/CxP), inventario, serie de
// ventas, flujo de efectivo, top productos y documentos que requieren acción.
// Números limpios (la UI formatea); cada sección sólo si su módulo está activo.
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireModule(session, 'dashboard');
  requirePerm(session, 'dashboard', 'ver');
  const supabase = erpClientFor(session);
  const has = (k: ModuleKey) => session.modules.some((m) => m.key === k);

  const daysParam = Number(new URL(req.url).searchParams.get('days'));
  const days = RANGES.has(daysParam) ? daysParam : 30;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const rangeStart = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Mismo corte del mes anterior: mismo tiempo transcurrido, sin invadir el mes actual.
  const prevMonthCut = new Date(
    Math.min(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()), monthStart.getTime()),
  );
  // Las consultas de pedidos comparten un solo "desde": lo más viejo que ocupamos.
  const ordersSince = new Date(Math.min(rangeStart.getTime(), prevMonthStart.getTime()));

  const out: DashboardData = {
    range: { days, from: localYmd(rangeStart), to: localYmd(todayStart) },
  };

  const jobs: Promise<void>[] = [];
  const pendientes: NonNullable<DashboardData['pendientes']> = [];

  if (has('ordenes')) {
    jobs.push(
      (async () => {
        const [{ data: orderRows }, { data: openOrders }, { data: cogsRows }] = await Promise.all([
          supabase
            .from('orders')
            .select('total, subtotal, created_at')
            .gte('created_at', ordersSince.toISOString())
            .neq('status', 'cancelada'),
          supabase
            .from('orders')
            .select('total')
            .in('status', ['confirmado', 'pagado', 'surtido_parcial']),
          has('inventario')
            ? supabase
                .from('inventory_movements')
                .select('qty, unit_cost')
                .eq('type', 'salida')
                .eq('ref_type', 'order')
                .gte('created_at', monthStart.toISOString())
            : Promise.resolve({ data: null }),
        ]);

        const rows = orderRows ?? [];
        let ventasHoy = 0;
        let pedidosHoy = 0;
        let ventasAyer = 0;
        let ventasMes = 0;
        let subtotalMes = 0;
        let pedidosMes = 0;
        let ventasPrev = 0;
        const trend = Array.from({ length: days }, (_, i) => ({
          date: localYmd(new Date(rangeStart.getTime() + i * DAY_MS)),
          total: 0,
          orders: 0,
        }));

        for (const o of rows) {
          const t = new Date(o.created_at).getTime();
          const total = Number(o.total);
          if (t >= todayStart.getTime()) {
            ventasHoy += total;
            pedidosHoy += 1;
          } else if (t >= yesterdayStart.getTime()) {
            ventasAyer += total;
          }
          if (t >= monthStart.getTime()) {
            ventasMes += total;
            subtotalMes += Number(o.subtotal);
            pedidosMes += 1;
          } else if (t >= prevMonthStart.getTime() && t < prevMonthCut.getTime()) {
            ventasPrev += total;
          }
          const idx = Math.floor((t - rangeStart.getTime()) / DAY_MS);
          if (idx >= 0 && idx < days) {
            trend[idx].total += total;
            trend[idx].orders += 1;
          }
        }
        for (const p of trend) p.total = Math.round(p.total);

        out.hoy = {
          ventas: Math.round(ventasHoy),
          pedidos: pedidosHoy,
          delta: deltaOf(ventasHoy, ventasAyer, 'ayer'),
        };

        // Margen bruto del mes: ventas sin IVA menos costo de lo vendido según
        // kardex (salidas por pedido a costo promedio). Si el costo capturado
        // es 0 el margen refleja eso: mejora conforme se capturan costos.
        const cogs = (cogsRows ?? []).reduce(
          (a, m) => a + -Number(m.qty) * Number(m.unit_cost ?? 0),
          0,
        );
        const margenMonto = subtotalMes - cogs;
        out.mes = {
          ventas: Math.round(ventasMes),
          pedidos: pedidosMes,
          ticketPromedio: pedidosMes ? Math.round(ventasMes / pedidosMes) : 0,
          delta: deltaOf(ventasMes, ventasPrev, 'mes anterior'),
          margenPct: subtotalMes > 0 ? Math.round(((margenMonto / subtotalMes) * 100) * 10) / 10 : null,
          margenMonto: subtotalMes > 0 ? Math.round(margenMonto) : null,
        };
        out.salesTrend = trend;

        const open = openOrders ?? [];
        pendientes.push({
          key: 'pedidos_surtir',
          label: 'Pedidos por surtir',
          count: open.length,
          amount: Math.round(open.reduce((a, o) => a + Number(o.total), 0)),
          href: '/panel/pedidos',
        });
      })(),
    );

    jobs.push(
      (async () => {
        // Top productos del rango por importe (join interno a pedidos vigentes).
        const { data } = await supabase
          .from('order_items')
          .select('sku, name, qty, line_total, orders!inner(created_at, status)')
          .gte('orders.created_at', rangeStart.toISOString())
          .neq('orders.status', 'cancelada');
        const bySku = new Map<string, { sku: string; name: string; qty: number; amount: number }>();
        for (const r of data ?? []) {
          const key = r.sku ?? r.name;
          const acc = bySku.get(key) ?? { sku: r.sku ?? '—', name: r.name, qty: 0, amount: 0 };
          acc.qty += Number(r.qty);
          acc.amount += Number(r.line_total);
          bySku.set(key, acc);
        }
        out.topProducts = [...bySku.values()]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)
          .map((p) => ({ ...p, amount: Math.round(p.amount) }));
      })(),
    );
  }

  if (has('cotizaciones')) {
    jobs.push(
      (async () => {
        const { data } = await supabase
          .from('quotes')
          .select('total')
          .in('status', ['borrador', 'enviada']);
        const rows = data ?? [];
        pendientes.push({
          key: 'cotizaciones_abiertas',
          label: 'Cotizaciones abiertas',
          count: rows.length,
          amount: Math.round(rows.reduce((a, q) => a + Number(q.total), 0)),
          href: '/panel/cotizaciones',
        });
      })(),
    );
  }

  if (has('facturacion')) {
    jobs.push(
      (async () => {
        const [{ data: openInv }, { data: draftInv }] = await Promise.all([
          supabase
            .from('invoices')
            .select('saldo, timbrada_at, created_at')
            .gt('saldo', 0)
            .in('status', ['timbrada', 'pago_parcial']),
          supabase.from('invoices').select('total').eq('status', 'borrador'),
        ]);
        const aging = agingOf(
          (openInv ?? []).map((r) => ({
            saldo: Number(r.saldo ?? 0),
            base: r.timbrada_at ?? r.created_at,
          })),
        );
        out.cxc = aging;
        const drafts = draftInv ?? [];
        pendientes.push({
          key: 'facturas_timbrar',
          label: 'Facturas por timbrar',
          count: drafts.length,
          amount: Math.round(drafts.reduce((a, i) => a + Number(i.total), 0)),
          href: '/panel/facturacion',
        });
      })(),
    );
  }

  if (has('compras')) {
    jobs.push(
      (async () => {
        const [{ data: openSup }, { data: openPos }, { data: reqs }] = await Promise.all([
          supabase
            .from('supplier_invoices')
            .select('saldo, fecha')
            .gt('saldo', 0)
            .in('status', ['registrada', 'pago_parcial']),
          supabase
            .from('purchase_orders')
            .select('total')
            .in('status', ['borrador', 'confirmada', 'recibida_parcial']),
          supabase.from('requisitions').select('id').eq('status', 'borrador'),
        ]);
        const aging = agingOf(
          (openSup ?? []).map((r) => ({ saldo: Number(r.saldo ?? 0), base: r.fecha })),
        );
        out.cxp = { total: aging.total, facturas: aging.facturas, vencido31: aging.vencido31 };
        const pos = openPos ?? [];
        pendientes.push({
          key: 'oc_abiertas',
          label: 'Órdenes de compra abiertas',
          count: pos.length,
          amount: Math.round(pos.reduce((a, p) => a + Number(p.total), 0)),
          href: '/panel/compras',
        });
        pendientes.push({
          key: 'requisiciones_aprobar',
          label: 'Requisiciones por aprobar',
          count: (reqs ?? []).length,
          amount: null,
          href: '/panel/compras/requisiciones',
        });
      })(),
    );
  }

  if (has('inventario')) {
    jobs.push(
      (async () => {
        const { data: inv } = await supabase
          .from('inventory')
          .select('stock, min_stock, avg_cost, product_variant_id, product_variants ( sku, products ( name ) )');
        const invRows = (inv ?? []) as unknown as RawInventory[];
        const valor = invRows.reduce((a, r) => a + Number(r.stock) * Number(r.avg_cost), 0);
        const skus = new Set(invRows.filter((r) => r.stock > 0).map((r) => r.product_variant_id));
        const low = invRows
          .filter((r) => semaforo(r.stock, r.min_stock) !== 'ok')
          .sort((a, b) => a.stock / Math.max(1, a.min_stock) - b.stock / Math.max(1, b.min_stock));
        out.inventario = { valor: Math.round(valor), skus: skus.size, stockBajo: low.length };
        out.stockAlerts = low.slice(0, 8).map((r) => ({
          sku: r.product_variants?.sku ?? '',
          name: r.product_variants?.products?.name ?? '',
          stock: r.stock,
          minStock: r.min_stock,
        }));
      })(),
    );
  }

  if (has('pagos')) {
    jobs.push(
      (async () => {
        const fromYmd = localYmd(rangeStart);
        const [{ data: inPays }, { data: outPays }] = await Promise.all([
          supabase.from('invoice_payments').select('fecha, monto').gte('fecha', fromYmd),
          supabase.from('supplier_invoice_payments').select('fecha, monto').gte('fecha', fromYmd),
        ]);
        // Cubetas diarias para rangos cortos; semanales (lunes) para 30/90 días.
        const daily = days <= 14;
        const bucketKey = (ymd: string): string => {
          if (daily) return ymd;
          const d = new Date(`${ymd}T00:00:00`);
          const dow = (d.getDay() + 6) % 7; // lunes = 0
          return localYmd(new Date(d.getTime() - dow * DAY_MS));
        };
        const series = new Map<string, { label: string; cobros: number; pagos: number }>();
        // Pre-crea las cubetas del rango para que los huecos salgan en 0.
        for (let t = rangeStart.getTime(); t <= todayStart.getTime(); t += DAY_MS) {
          const key = bucketKey(localYmd(new Date(t)));
          if (!series.has(key)) series.set(key, { label: key, cobros: 0, pagos: 0 });
        }
        for (const p of inPays ?? []) {
          const b = series.get(bucketKey(p.fecha));
          if (b) b.cobros += Number(p.monto);
        }
        for (const p of outPays ?? []) {
          const b = series.get(bucketKey(p.fecha));
          if (b) b.pagos += Number(p.monto);
        }
        const list = [...series.values()]
          .sort((a, b) => (a.label < b.label ? -1 : 1))
          .map((s) => ({ label: s.label, cobros: Math.round(s.cobros), pagos: Math.round(s.pagos) }));
        const cobros = list.reduce((a, s) => a + s.cobros, 0);
        const pagos = list.reduce((a, s) => a + s.pagos, 0);
        out.flujo = { cobros, pagos, neto: cobros - pagos, bucket: daily ? 'dia' : 'semana', series: list };
      })(),
    );
  }

  if (has('calendario')) {
    jobs.push(
      (async () => {
        const dayEnd = new Date(todayStart.getTime() + DAY_MS);
        const { data: appts } = await supabase
          .from('appointments')
          .select('id, starts_at, patient_name, status')
          .gte('starts_at', todayStart.toISOString())
          .lt('starts_at', dayEnd.toISOString())
          .neq('status', 'cancelada')
          .order('starts_at');
        out.todayAppointments = (appts ?? []).map((a) => ({
          id: a.id,
          startsAt: a.starts_at,
          patientName: a.patient_name,
          status: a.status,
        }));
      })(),
    );
  }

  await Promise.all(jobs);

  // Orden estable de la lista de acción (independiente de qué job acabó antes).
  const orderKeys = [
    'cotizaciones_abiertas',
    'pedidos_surtir',
    'facturas_timbrar',
    'oc_abiertas',
    'requisiciones_aprobar',
  ];
  out.pendientes = pendientes.sort((a, b) => orderKeys.indexOf(a.key) - orderKeys.indexOf(b.key));

  return ok(out);
});
