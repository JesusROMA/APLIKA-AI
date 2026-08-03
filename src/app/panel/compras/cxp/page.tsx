'use client';

/**
 * CUENTAS POR PAGAR — listado paginado de facturas de proveedor. Fila →
 * detalle. "Registrar factura" (gated compras/crear) y acceso al reporte CxP.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SupplierInvoiceRow, SupplierInvoiceStatus } from '@/lib/types/erp-compras';
import { listSupplierInvoices } from '../../_lib/cxp';
import { usePaginated } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { DataTable, type Column } from '../../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

const STATUS_LABEL: Record<SupplierInvoiceStatus, string> = {
  borrador: 'Borrador',
  registrada: 'Registrada',
  pagada: 'Pagada',
  pago_parcial: 'Pago parcial',
  cancelada: 'Cancelada',
};

function statusTone(s: SupplierInvoiceStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (s === 'pagada') return 'on';
  if (s === 'cancelada') return 'ro';
  if (s === 'borrador') return 'off';
  return 'blue';
}

export default function CxpListPage() {
  const can = useCan();
  const router = useRouter();
  const list = usePaginated<SupplierInvoiceRow>(listSupplierInvoices);

  const columns: Column<SupplierInvoiceRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    { key: 'supplier', header: 'Proveedor', render: (r) => r.supplierName ?? '—' },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</Badge>,
    },
    { key: 'fecha', header: 'Fecha', render: (r) => DATE.format(new Date(r.fecha)) },
    { key: 'total', header: 'Total', numeric: true, render: (r) => MXN.format(r.total) },
    {
      key: 'saldo',
      header: 'Saldo',
      numeric: true,
      render: (r) => (r.saldo === null ? '—' : MXN.format(r.saldo)),
    },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Cuentas por pagar</h2>
          <p className="panel-page-sub">Facturas de proveedores, pagos y saldos.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/compras">
          Volver a compras
        </Link>
      </div>

      <DataTable
        columns={columns}
        rows={list.data?.data ?? []}
        rowKey={(r) => r.id}
        page={list.page}
        pageSize={list.pageSize}
        total={list.data?.total ?? 0}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        search={list.search}
        onSearchChange={list.setSearch}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(r) => router.push(`/panel/compras/cxp/${r.id}`)}
        searchPlaceholder="Buscar por folio o proveedor…"
        emptyTitle="Sin facturas"
        emptyMessage="Aún no has registrado facturas de proveedor."
        toolbarActions={
          <>
            <Link className="pbtn pbtn--ghost" href="/panel/compras/cxp/reporte">
              Reporte CxP
            </Link>
            {can('compras', 'crear') ? (
              <Link className="pbtn pbtn--primary" href="/panel/compras/cxp/nueva">
                + Registrar factura
              </Link>
            ) : (
              <ReadOnlyBadge />
            )}
          </>
        }
      />
    </div>
  );
}
