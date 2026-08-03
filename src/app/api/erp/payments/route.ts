import { z } from 'zod';
import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type {
  PaymentMovement,
  PaymentsResponse,
} from '@/app/panel/_lib/pagos';

export const dynamic = 'force-dynamic';

// Tope de renglones por tabla al consolidar. Los totales se calculan sobre lo
// devuelto; con filtros de fecha razonables cubre de sobra la operación.
const MAX_ROWS = 1000;

const Query = z.object({
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  direction: z.enum(['in', 'out']).optional(),
  formaPago: z.string().trim().min(1).optional(),
});

interface RawInPayment {
  id: string;
  fecha: string;
  monto: number;
  forma_pago: string;
  is_rep: boolean;
  invoices: { folio: string | null; customers: { name: string } | null } | null;
}

interface RawOutPayment {
  id: string;
  fecha: string;
  monto: number;
  forma_pago: string;
  supplier_invoices:
    | { folio: string | null; suppliers: { name: string } | null }
    | null;
}

// GET /api/erp/payments — Tablero consolidado de cobros y pagos (pagos/ver).
// Lee `invoice_payments` (cobros) y `supplier_invoice_payments` (pagos) bajo
// RLS, unifica en movimientos, ordena por fecha desc y calcula totales.
// Query: ?from=&to=&direction=in|out&formaPago=
export const GET = handle(async (req) => {
  const session = await getErpSession();
  requireAccess(session, 'pagos', 'ver');
  const supabase = erpClientFor(session);

  const { from, to, direction, formaPago } = Query.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );

  const wantIn = direction !== 'out';
  const wantOut = direction !== 'in';

  const movements: PaymentMovement[] = [];

  if (wantIn) {
    let q = supabase
      .from('invoice_payments')
      .select(
        'id, fecha, monto, forma_pago, is_rep, invoices ( folio, customers ( name ) )',
      );
    if (from) q = q.gte('fecha', from);
    if (to) q = q.lte('fecha', to);
    if (formaPago) q = q.eq('forma_pago', formaPago);

    const { data, error } = await q
      .order('fecha', { ascending: false })
      .limit(MAX_ROWS);
    if (error) throw error;

    for (const r of (data ?? []) as unknown as RawInPayment[]) {
      movements.push({
        id: r.id,
        direction: 'in',
        date: r.fecha,
        amount: Number(r.monto),
        formaPago: r.forma_pago,
        party: r.invoices?.customers?.name ?? null,
        docFolio: r.invoices?.folio ?? null,
        docType: 'factura',
        isRep: r.is_rep,
      });
    }
  }

  if (wantOut) {
    let q = supabase
      .from('supplier_invoice_payments')
      .select(
        'id, fecha, monto, forma_pago, supplier_invoices ( folio, suppliers ( name ) )',
      );
    if (from) q = q.gte('fecha', from);
    if (to) q = q.lte('fecha', to);
    if (formaPago) q = q.eq('forma_pago', formaPago);

    const { data, error } = await q
      .order('fecha', { ascending: false })
      .limit(MAX_ROWS);
    if (error) throw error;

    for (const r of (data ?? []) as unknown as RawOutPayment[]) {
      movements.push({
        id: r.id,
        direction: 'out',
        date: r.fecha,
        amount: Number(r.monto),
        formaPago: r.forma_pago,
        party: r.supplier_invoices?.suppliers?.name ?? null,
        docFolio: r.supplier_invoices?.folio ?? null,
        docType: 'compra',
      });
    }
  }

  // Orden global por fecha desc (desempate estable por id).
  movements.sort((a, b) => {
    if (a.date === b.date) return a.id < b.id ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  });

  let cobros = 0;
  let pagos = 0;
  for (const m of movements) {
    if (m.direction === 'in') cobros += m.amount;
    else pagos += m.amount;
  }

  const body: PaymentsResponse = {
    data: movements,
    totals: { cobros, pagos, neto: cobros - pagos },
  };
  return ok(body);
});
