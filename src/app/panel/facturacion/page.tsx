'use client';

/**
 * FACTURACIÓN — listado paginado de facturas (CFDI 4.0). Fila → detalle.
 * "Nueva factura" (gated facturacion/crear) y acceso a Cuentas por cobrar.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { InvoiceRow, InvoiceStatus } from '@/lib/types/erp-ventas';
import { listInvoices } from '../_lib/facturacion';
import { usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../_components/States';

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

export default function FacturacionPage() {
  const can = useCan();
  const router = useRouter();
  const list = usePaginated<InvoiceRow>(listInvoices);

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'folio',
      header: 'Folio',
      render: (r) => <strong>{`${r.serie}-${r.folio}`}</strong>,
    },
    { key: 'customer', header: 'Cliente', render: (r) => r.customerName ?? 'Público en general' },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</Badge>,
    },
    { key: 'metodo', header: 'Método', render: (r) => r.metodoPago },
    { key: 'total', header: 'Total', numeric: true, render: (r) => MXN.format(r.total) },
    {
      key: 'saldo',
      header: 'Saldo',
      numeric: true,
      render: (r) => (r.saldo === null ? '—' : MXN.format(r.saldo)),
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (r) => DATE.format(new Date(r.createdAt)),
    },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Facturación</h2>
          <p className="panel-page-sub">Comprobantes fiscales (CFDI 4.0), timbrado y cobranza.</p>
        </div>
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
        onRowClick={(r) => router.push(`/panel/facturacion/${r.id}`)}
        searchPlaceholder="Buscar por folio, UUID o cliente…"
        emptyTitle="Sin facturas"
        emptyMessage="Aún no has emitido facturas."
        toolbarActions={
          <>
            <Link className="pbtn pbtn--ghost" href="/panel/facturacion/cxc">
              Cuentas por cobrar
            </Link>
            {can('facturacion', 'crear') ? (
              <Link className="pbtn pbtn--primary" href="/panel/facturacion/nueva">
                + Nueva factura
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
