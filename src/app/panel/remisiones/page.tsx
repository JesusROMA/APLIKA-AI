'use client';

/**
 * Listado de Remisiones (venta de mostrador). Tabla paginada + accesos a
 * "Nueva remisión" (gated) y al "Corte del día". Cada fila abre el detalle.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SalesNoteRow } from '@/lib/types/erp-ventas';
import { listSalesNotes } from '../_lib/remisiones';
import { usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../_components/States';
import { MXN, STATUS_LABEL, fmtDate, paymentLabel, statusTone } from './_components/labels';

export default function RemisionesPage() {
  const can = useCan();
  const router = useRouter();
  const list = usePaginated<SalesNoteRow>(listSalesNotes);

  const columns: Column<SalesNoteRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    {
      key: 'customer',
      header: 'Cliente',
      render: (r) => r.customerName ?? <span className="panel-field-hint">Público en general</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</Badge>,
    },
    { key: 'payment', header: 'Método de pago', render: (r) => paymentLabel(r.paymentMethod) },
    { key: 'total', header: 'Total', numeric: true, render: (r) => MXN.format(r.total) },
    { key: 'date', header: 'Fecha', render: (r) => fmtDate(r.createdAt) },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Remisiones</h2>
          <p className="panel-page-sub">Venta de mostrador rápida y corte del día.</p>
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
        onRowClick={(r) => router.push(`/panel/remisiones/${r.id}`)}
        searchPlaceholder="Buscar por folio o cliente…"
        emptyTitle="Sin remisiones"
        emptyMessage="Aún no has registrado ventas de mostrador."
        toolbarActions={
          <>
            <Link className="pbtn pbtn--ghost" href="/panel/remisiones/corte">
              Corte del día
            </Link>
            {can('remisiones', 'crear') ? (
              <Link className="pbtn pbtn--primary" href="/panel/remisiones/nueva">
                + Nueva remisión
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
