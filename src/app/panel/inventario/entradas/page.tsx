'use client';

/**
 * Inventario · Órdenes de entrada (F6 · Tanda B, módulo `inventario`). Es el
 * ÚNICO camino de entrada de inventario: una OE se crea (manual o desde una OC)
 * y al aplicarla postea al inventario con costo (sube el costo promedio).
 * Listado paginado (folio, almacén, origen, estado, fecha). "Nueva orden de
 * entrada" (gated inventario/crear) navega al alta; la fila navega al detalle.
 * El server manda; la UI sólo oculta.
 */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { EntryOrderRow } from '@/lib/types/erp-compras';
import {
  listEntryOrders,
  ENTRY_STATUS_LABEL,
  entryStatusTone,
  ORIGIN_LABEL,
} from '../../_lib/entradas';
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

export default function EntradasPage() {
  const router = useRouter();
  const can = useCan();
  const list = usePaginated<EntryOrderRow>(listEntryOrders);

  const columns: Column<EntryOrderRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    { key: 'warehouse', header: 'Almacén', render: (r) => r.warehouseName ?? '—' },
    { key: 'origin', header: 'Origen', render: (r) => ORIGIN_LABEL[r.origin] },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={entryStatusTone(r.status)}>{ENTRY_STATUS_LABEL[r.status]}</Badge>,
    },
    { key: 'createdAt', header: 'Fecha', render: (r) => fmtDate(r.createdAt) },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Órdenes de entrada</h2>
          <p className="panel-page-sub">
            Único camino de entrada de inventario: registra la mercancía y aplícala para subirla al
            inventario con costo (afecta el costo promedio).
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
        onRowClick={(r) => router.push(`/panel/inventario/entradas/${r.id}`)}
        searchPlaceholder="Buscar por folio…"
        emptyTitle="Sin órdenes de entrada"
        emptyMessage="Aún no has registrado órdenes de entrada."
        toolbarActions={
          can('inventario', 'crear') ? (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => router.push('/panel/inventario/entradas/nueva')}
            >
              + Nueva orden de entrada
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />
    </div>
  );
}
