import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { CxcRow } from '@/lib/types/erp-ventas';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

interface RawCxc {
  id: string;
  serie: string;
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

// GET /api/erp/invoices/cxc — Cuentas por Cobrar: facturas con saldo > 0 y
// antigüedad del saldo por bucket (facturacion/ver). Agregación en JS.
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'facturacion', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('invoices')
    .select('id, serie, folio, customer_id, total, saldo, timbrada_at, created_at, customers ( name )')
    .gt('saldo', 0)
    .in('status', ['timbrada', 'pago_parcial'])
    .order('timbrada_at', { ascending: true });
  if (error) throw error;

  const now = Date.now();
  const rows: CxcRow[] = ((data ?? []) as unknown as RawCxc[]).map((r) => {
    const base = new Date(r.timbrada_at ?? r.created_at).getTime();
    const daysOverdue = Number.isNaN(base) ? 0 : Math.max(0, Math.floor((now - base) / DAY_MS));
    return {
      invoiceId: r.id,
      folio: `${r.serie}-${r.folio}`,
      customerId: r.customer_id,
      customerName: r.customers?.name ?? null,
      total: Number(r.total),
      saldo: Number(r.saldo ?? 0),
      daysOverdue,
      bucket: bucketFor(daysOverdue),
    };
  });

  return ok(rows);
});
