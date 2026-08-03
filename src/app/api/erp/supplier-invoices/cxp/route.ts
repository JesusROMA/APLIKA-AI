import { handle, ok } from '@/lib/api';
import { getErpSession } from '@/lib/erp/session';
import { requireAccess } from '@/lib/erp/guards';
import { erpClientFor } from '@/lib/erp/db';
import type { CxpRow } from '@/lib/types/erp-compras';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

interface RawCxp {
  id: string;
  folio: string;
  supplier_id: string;
  total: number;
  saldo: number | null;
  fecha: string;
  suppliers: { name: string } | null;
}

function bucketFor(days: number): CxpRow['bucket'] {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

// GET /api/erp/supplier-invoices/cxp — Cuentas por Pagar: facturas con saldo > 0
// y antigüedad del saldo por bucket (compras/ver). Agregación en JS.
export const GET = handle(async () => {
  const session = await getErpSession();
  requireAccess(session, 'compras', 'ver');
  const supabase = erpClientFor(session);

  const { data, error } = await supabase
    .from('supplier_invoices')
    .select('id, folio, supplier_id, total, saldo, fecha, suppliers ( name )')
    .gt('saldo', 0)
    .in('status', ['registrada', 'pago_parcial'])
    .order('fecha', { ascending: true });
  if (error) throw error;

  const now = Date.now();
  const rows: CxpRow[] = ((data ?? []) as unknown as RawCxp[]).map((r) => {
    const base = new Date(r.fecha).getTime();
    const daysOverdue = Number.isNaN(base) ? 0 : Math.max(0, Math.floor((now - base) / DAY_MS));
    return {
      invoiceId: r.id,
      folio: r.folio,
      supplierId: r.supplier_id,
      supplierName: r.suppliers?.name ?? null,
      total: Number(r.total),
      saldo: Number(r.saldo ?? 0),
      daysOverdue,
      bucket: bucketFor(daysOverdue),
    };
  });

  return ok(rows);
});
