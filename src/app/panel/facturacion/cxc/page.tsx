'use client';

/**
 * CUENTAS POR COBRAR (F7) — listado paginado de facturas de cliente con saldo
 * vivo. Fila → detalle. "Registrar factura" (gated facturacion/crear) y acceso
 * al reporte de antigüedad de saldos. Misma dinámica que CxP.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { InvoiceRow, InvoiceStatus } from '@/lib/types/erp-ventas';
import { listReceivables } from '../../_lib/cxc';
import { usePaginated } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { DataTable, type Column } from '../../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  borrador: 'Borrador',
  timbrada: 'Timbrada',
  pagada: 'Pagada',
  pago_parcial: 'Pago parcial',
  cancelada: 'Cancelada',
};

function statusTone(s: InvoiceStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (s === 'pagada') return 'on';
  if (s === 'cancelada') return 'ro';
  if (s === 'borrador') return 'off';
  return 'blue';
}

export default function CxcListPage() {
  const can = useCan();
  const router = useRouter();
  const list = usePaginated<InvoiceRow>(listReceivables);

  const columns: Column<InvoiceRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    { key: 'customer', header: 'Cliente', render: (r) => r.customerName ?? 'Público en general' },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</Badge>,
    },
    { key: 'fecha', header: 'Fecha', render: (r) => DATE.format(new Date(r.createdAt)) },
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
          <h2 className="panel-page-title">Cuentas por cobrar</h2>
          <p className="panel-page-sub">Facturas de clientes con saldo pendiente y cobranza.</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/facturacion">
          Volver a Facturación
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
        onRowClick={(r) => router.push(`/panel/facturacion/cxc/${r.id}`)}
        searchPlaceholder="Buscar por folio o cliente…"
        emptyTitle="Sin saldos"
        emptyMessage="No hay facturas con saldo pendiente."
        toolbarActions={
          <>
            <Link className="pbtn pbtn--ghost" href="/panel/facturacion/cxc/aging">
              Antigüedad de saldos
            </Link>
            {can('facturacion', 'crear') ? (
              <Link className="pbtn pbtn--primary" href="/panel/facturacion/cxc/nueva">
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
