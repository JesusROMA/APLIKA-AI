'use client';

/**
 * Inventario · Existencias (F2 · Tanda B). Tabla paginada de existencias por
 * variante+almacén (stock, costo promedio, valor, min/max) con badge de "stock
 * bajo". "Registrar movimiento" (gated inventario/crear) abre el drawer de alta;
 * la fila abre el kardex de esa variante+almacén. El server manda; la UI oculta.
 */

import { useState } from 'react';
import type { StockRow } from '@/lib/types/erp-inventario';
import { listStock } from '../_lib/inventario';
import { usePaginated } from '../_lib/hooks';
import { useCan } from '../_components/session';
import { DataTable, type Column } from '../_components/DataTable';
import { Badge, ReadOnlyBadge } from '../_components/States';
import { InventarioNav } from './_components/InventarioNav';
import { MovementDrawer } from './_components/MovementDrawer';
import { KardexPanel } from './_components/KardexPanel';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export default function InventarioPage() {
  const can = useCan();
  const list = usePaginated<StockRow>(listStock);
  const [creating, setCreating] = useState(false);
  const [kardexRow, setKardexRow] = useState<StockRow | null>(null);

  const columns: Column<StockRow>[] = [
    { key: 'sku', header: 'SKU', render: (r) => <strong>{r.sku}</strong> },
    {
      key: 'product',
      header: 'Producto',
      render: (r) => (
        <span>
          {r.productName}
          {r.name && r.name !== r.productName ? ` · ${r.name}` : ''}
        </span>
      ),
    },
    { key: 'warehouse', header: 'Almacén', render: (r) => r.warehouseName },
    {
      key: 'stock',
      header: 'Stock',
      numeric: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 'var(--sp-1)', alignItems: 'center' }}>
          {r.stock}
          {r.minStock > 0 && r.stock < r.minStock && <Badge tone="off">Stock bajo</Badge>}
        </span>
      ),
    },
    { key: 'avgCost', header: 'Costo prom.', numeric: true, render: (r) => MXN.format(r.avgCost) },
    { key: 'value', header: 'Valor', numeric: true, render: (r) => MXN.format(r.value) },
    {
      key: 'minmax',
      header: 'Mín. / Máx.',
      numeric: true,
      render: (r) => `${r.minStock} / ${r.maxStock}`,
    },
  ];

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Inventario</h2>
          <p className="panel-page-sub">Existencias por variante y almacén (costo promedio).</p>
        </div>
      </div>

      <InventarioNav />

      <DataTable
        columns={columns}
        rows={list.data?.data ?? []}
        rowKey={(r) => `${r.variantId}:${r.warehouseId}`}
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
        onRowClick={(r) => setKardexRow(r)}
        searchPlaceholder="Buscar por SKU o producto…"
        emptyTitle="Sin existencias"
        emptyMessage="Aún no hay inventario registrado."
        toolbarActions={
          can('inventario', 'crear') ? (
            <button type="button" className="pbtn pbtn--primary" onClick={() => setCreating(true)}>
              + Registrar movimiento
            </button>
          ) : (
            <ReadOnlyBadge />
          )
        }
      />

      {creating && (
        <MovementDrawer
          canCreate={can('inventario', 'crear')}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}

      {kardexRow && <KardexPanel row={kardexRow} onClose={() => setKardexRow(null)} />}
    </div>
  );
}
