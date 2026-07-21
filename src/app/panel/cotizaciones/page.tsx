'use client';

/**
 * Cotizaciones — listado paginado (F1 · Tanda B). Tabla con folio, cliente,
 * estado, vigencia, total y fecha. "Nueva cotización" (gated cotizaciones/crear)
 * navega al alta; la fila navega al detalle. El server manda; la UI sólo oculta.
 */

import { useRouter } from 'next/navigation';
import type { QuoteRow } from '@/lib/types/erp-ventas';
import { listQuotes } from '../_lib/cotizaciones';
import { usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../_components/States';
import { QUOTE_STATUS_LABEL, quoteTone } from './_components/status';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

export default function CotizacionesPage() {
  const router = useRouter();
  const can = useCan();
  const list = usePaginated<QuoteRow>(listQuotes);

  const columns: Column<QuoteRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    { key: 'customer', header: 'Cliente', render: (r) => r.customerName ?? 'Público en general' },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={quoteTone(r.status)}>{QUOTE_STATUS_LABEL[r.status]}</Badge>,
    },
    { key: 'validUntil', header: 'Vigencia', render: (r) => fmtDate(r.validUntil) },
    { key: 'total', header: 'Total', numeric: true, render: (r) => MXN.format(r.total) },
    { key: 'createdAt', header: 'Fecha', render: (r) => fmtDate(r.createdAt) },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Cotizaciones</h2>
          <p className="panel-page-sub">Propuestas de venta (quote-to-cash).</p>
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
        onRowClick={(r) => router.push(`/panel/cotizaciones/${r.id}`)}
        searchPlaceholder="Buscar por folio o cliente…"
        emptyTitle="Sin cotizaciones"
        emptyMessage="Aún no has creado cotizaciones."
        toolbarActions={
          can('cotizaciones', 'crear') ? (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => router.push('/panel/cotizaciones/nueva')}
            >
              + Nueva cotización
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />
    </div>
  );
}
