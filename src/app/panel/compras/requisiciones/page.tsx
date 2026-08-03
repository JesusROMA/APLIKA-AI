'use client';

/**
 * Requisiciones — listado (F6 · Tanda B, módulo `compras`). Solicitudes internas
 * de compra: folio, estado, #partidas y fecha. "Nueva requisición" (gated
 * compras/crear) navega al alta; la fila navega al detalle. El server manda; la
 * UI sólo oculta.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RequisitionRow } from '@/lib/types/erp-compras';
import { listRequisitions, REQ_STATUS_LABEL, reqStatusTone } from '../../_lib/requisiciones';
import { usePaginated } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { DataTable, type Column } from '../../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../../_components/States';

const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

export default function RequisicionesPage() {
  const router = useRouter();
  const can = useCan();
  const list = usePaginated<RequisitionRow>(listRequisitions);

  const columns: Column<RequisitionRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={reqStatusTone(r.status)}>{REQ_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'itemCount',
      header: 'Partidas',
      numeric: true,
      render: (r) => r.itemCount,
    },
    { key: 'createdAt', header: 'Fecha', render: (r) => fmtDate(r.createdAt) },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Requisiciones</h2>
          <p className="panel-page-sub">
            Solicitudes internas de compra: crea, aprueba y convierte en orden de compra.
          </p>
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
        onRowClick={(r) => router.push(`/panel/compras/requisiciones/${r.id}`)}
        searchPlaceholder="Buscar por folio…"
        emptyTitle="Sin requisiciones"
        emptyMessage="Aún no has registrado requisiciones."
        toolbarActions={
          can('compras', 'crear') ? (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => router.push('/panel/compras/requisiciones/nueva')}
            >
              + Nueva requisición
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />
    </div>
  );
}
