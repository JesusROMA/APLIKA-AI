'use client';

/**
 * Compras — RAÍZ del área (F5 · Tanda B, módulo `compras`). Barra de navegación
 * (Órdenes · Proveedores · Cuentas por pagar) + listado paginado de órdenes de
 * compra (folio, proveedor, estado, total, fecha). "Nueva orden" (gated
 * compras/crear) navega al alta; la fila navega al detalle. El server manda; la
 * UI sólo oculta.
 */

import { useRouter } from 'next/navigation';
import type { PurchaseOrderRow } from '@/lib/types/erp-compras';
import { listPurchaseOrders, PO_STATUS_LABEL, poStatusTone } from '../_lib/compras';
import { usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../_components/States';
import { ComprasNav } from './_components/ComprasNav';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

export default function ComprasPage() {
  const router = useRouter();
  const can = useCan();
  const list = usePaginated<PurchaseOrderRow>(listPurchaseOrders);

  const columns: Column<PurchaseOrderRow>[] = [
    { key: 'folio', header: 'Folio', render: (r) => <strong>{r.folio}</strong> },
    { key: 'supplier', header: 'Proveedor', render: (r) => r.supplierName ?? '—' },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => <Badge tone={poStatusTone(r.status)}>{PO_STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      render: (r) => MXN.format(r.total),
    },
    { key: 'createdAt', header: 'Fecha', render: (r) => fmtDate(r.createdAt) },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Compras</h2>
          <p className="panel-page-sub">
            Órdenes de compra a proveedores: crea, confirma y recibe mercancía al inventario.
          </p>
        </div>
      </div>

      <ComprasNav />

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
        onRowClick={(r) => router.push(`/panel/compras/${r.id}`)}
        searchPlaceholder="Buscar por folio o proveedor…"
        emptyTitle="Sin órdenes de compra"
        emptyMessage="Aún no has registrado órdenes de compra."
        toolbarActions={
          can('compras', 'crear') ? (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => router.push('/panel/compras/nueva')}
            >
              + Nueva orden
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />
    </div>
  );
}
