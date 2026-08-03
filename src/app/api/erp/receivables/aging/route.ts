import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { CxcRow } from '@/lib/types/erp-ventas';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

interface RawCxc {
  id: string;
  folio: string;
  customer_id: string | null;
  total: number;
  saldo: number | null;
  timbrada_at: string | null;
  created_at: string;
  customers: { name: string } | null;
}

function bucketFor(days: number): CxcRow['bucket'] {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

interface AgingResponse {
  rows: CxcRow[];
  totals: {
    byBucket: Record<CxcRow['bucket'], number>;
    total: number;
  };
}

// GET /api/erp/receivables/aging — Antigüedad de saldos: facturas con saldo > 0
// clasificadas por bucket de días vencidos desde timbrada_at/created_at, con
// totales por tramo (facturacion/ver). Agregación en JS.
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('invoices')
    .select('id, folio, customer_id, total, saldo, timbrada_at, created_at, customers ( name )')
    .gt('saldo', 0)
    .in('status', ['timbrada', 'pago_parcial'])
    .order('timbrada_at', { ascending: true });
  if (error) throw error;

  const now = Date.now();
  const byBucket: Record<CxcRow['bucket'], number> = {
    '0-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
  };
  let total = 0;

  const rows: CxcRow[] = ((data ?? []) as unknown as RawCxc[]).map((r) => {
    const base = new Date(r.timbrada_at ?? r.created_at).getTime();
    const daysOverdue = Number.isNaN(base) ? 0 : Math.max(0, Math.floor((now - base) / DAY_MS));
    const saldo = Number(r.saldo ?? 0);
    const bucket = bucketFor(daysOverdue);
    byBucket[bucket] += saldo;
    total += saldo;
    return {
      invoiceId: r.id,
      folio: r.folio,
      customerId: r.customer_id,
      customerName: r.customers?.name ?? null,
      total: Number(r.total),
      saldo,
      daysOverdue,
      bucket,
    };
  });

  const response: AgingResponse = { rows, totals: { byBucket, total } };
  return ok(response);
});
