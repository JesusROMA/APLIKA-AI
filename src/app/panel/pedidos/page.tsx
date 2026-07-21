'use client';

/**
 * Pedidos — listado paginado (F1 · Tanda B, módulo `ordenes`). Tabla con folio,
 * cliente, estado, canal, total y fecha. "Nuevo pedido" (gated ordenes/crear)
 * navega al alta; la fila navega al detalle. El server manda; la UI sólo oculta.
 */

import { useRouter } from 'next/navigation';
import type { OrderRow } from '@/lib/types/erp-ventas';
import { listOrders, ORDER_STATUS_LABEL, orderStatusTone } from '../_lib/pedidos';
import { usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

export default function PedidosPage() {
  const router = useRouter();
  const can = useCan();
  const list = usePaginated<OrderRow>(listOrders);

  const columns: Column<OrderRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    { key: 'customer', header: 'Cliente', render: (r) => r.customerName ?? 'Público en general' },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={orderStatusTone(r.status)}>{ORDER_STATUS_LABEL[r.status]}</Badge>,
    },
    { key: 'channel', header: 'Canal', render: (r) => r.channel ?? '—' },
    { key: 'total', header: 'Total', numeric: true, render: (r) => MXN.format(r.total) },
    { key: 'createdAt', header: 'Fecha', render: (r) => fmtDate(r.createdAt) },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Pedidos</h2>
          <p className="panel-page-sub">Órdenes de venta con pipeline y entregas por partida.</p>
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
        onRowClick={(r) => router.push(`/panel/pedidos/${r.id}`)}
        searchPlaceholder="Buscar por folio o cliente…"
        emptyTitle="Sin pedidos"
        emptyMessage="Aún no has registrado pedidos."
        toolbarActions={
          can('ordenes', 'crear') ? (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => router.push('/panel/pedidos/nuevo')}
            >
              + Nuevo pedido
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />
    </div>
  );
}
