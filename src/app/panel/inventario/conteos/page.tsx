'use client';

/**
 * Conteos físicos — listado paginado (F2 · Tanda B, módulo `inventario`). Tabla
 * con folio, almacén, estado, número de partidas y fecha. "Nuevo conteo" (gated
 * inventario/crear) navega al alta; la fila navega al detalle/captura. El server
 * (RLS + guards) es la autoridad; la UI sólo oculta.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CountRow } from '@/lib/types/erp-inventario';
import { listCounts, COUNT_STATUS_LABEL, countStatusTone } from '../../_lib/conteos';
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

export default function ConteosPage() {
  const router = useRouter();
  const can = useCan();
  const list = usePaginated<CountRow>(listCounts);

  const columns: Column<CountRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    { key: 'warehouse', header: 'Almacén', render: (r) => r.warehouseName ?? '—' },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={countStatusTone(r.status)}>{COUNT_STATUS_LABEL[r.status]}</Badge>,
    },
    { key: 'itemCount', header: 'Partidas', numeric: true, render: (r) => r.itemCount },
    { key: 'createdAt', header: 'Fecha', render: (r) => fmtDate(r.createdAt) },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Conteos físicos</h2>
          <p className="panel-page-sub">
            Captura existencias reales contra el sistema; al aplicar se generan ajustes solo por las
            diferencias.
          </p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/inventario">
          Volver a inventario
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
        onRowClick={(r) => router.push(`/panel/inventario/conteos/${r.id}`)}
        searchPlaceholder="Buscar por folio o almacén…"
        emptyTitle="Sin conteos"
        emptyMessage="Aún no has registrado conteos físicos."
        toolbarActions={
          can('inventario', 'crear') ? (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => router.push('/panel/inventario/conteos/nuevo')}
            >
              + Nuevo conteo
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />
    </div>
  );
}
