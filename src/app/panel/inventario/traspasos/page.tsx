'use client';

/**
 * Traspasos — listado paginado (F2 · Tanda B, módulo `inventario`). Tabla con
 * folio, origen → destino, estado, #partidas y fecha. "Nuevo traspaso" (gated
 * inventario/crear) navega al alta; la fila navega al detalle. El server manda;
 * la UI sólo oculta.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TransferRow } from '@/lib/types/erp-inventario';
import { listTransfers, TRANSFER_STATUS_LABEL, transferStatusTone } from '../../_lib/traspasos';
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

export default function TraspasosPage() {
  const router = useRouter();
  const can = useCan();
  const list = usePaginated<TransferRow>(listTransfers);

  const columns: Column<TransferRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    {
      key: 'ruta',
      header: 'Origen → Destino',
      render: (r) => `${r.fromWarehouseName ?? '—'} → ${r.toWarehouseName ?? '—'}`,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => (
        <Badge tone={transferStatusTone(r.status)}>{TRANSFER_STATUS_LABEL[r.status]}</Badge>
      ),
    },
    { key: 'itemCount', header: 'Partidas', numeric: true, render: (r) => r.itemCount },
    { key: 'createdAt', header: 'Fecha', render: (r) => fmtDate(r.createdAt) },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Traspasos</h2>
          <p className="panel-page-sub">
            Movimientos de existencias entre almacenes en dos pasos: enviar y recibir.
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
        onRowClick={(r) => router.push(`/panel/inventario/traspasos/${r.id}`)}
        searchPlaceholder="Buscar por folio o almacén…"
        emptyTitle="Sin traspasos"
        emptyMessage="Aún no has registrado traspasos entre almacenes."
        toolbarActions={
          can('inventario', 'crear') ? (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => router.push('/panel/inventario/traspasos/nuevo')}
            >
              + Nuevo traspaso
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />
    </div>
  );
}
