'use client';

/**
 * Tabla paginada genérica para los maestros. Trabaja sobre Paginated<T> del
 * contrato: controles de page / pageSize / search y estados vacío/carga/error.
 * La búsqueda es "controlada" por el padre (que hace el fetch); aquí sólo
 * emitimos onSearchChange (con debounce para no disparar en cada tecla).
 */

import { useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorState, TableSkeleton } from './States';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  numeric?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  search: string;
  onSearchChange: (s: string) => void;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyMessage?: string;
  toolbarActions?: React.ReactNode;
  searchPlaceholder?: string;
}

const PAGE_SIZES = [10, 25, 50, 100];

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  search,
  onSearchChange,
  loading,
  error,
  onRetry,
  onRowClick,
  emptyTitle,
  emptyMessage,
  toolbarActions,
  searchPlaceholder = 'Buscar…',
}: DataTableProps<T>) {
  const [term, setTerm] = useState(search);

  // Debounce de la búsqueda (350ms) → onSearchChange.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => onSearchChange(term.trim()), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div>
      <div className="panel-toolbar">
        <input
          type="search"
          className="panel-input panel-search"
          placeholder={searchPlaceholder}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Buscar en la tabla"
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--sp-1)' }}>
          {toolbarActions}
        </div>
      </div>

      {loading ? (
        <TableSkeleton cols={columns.length} />
      ) : error ? (
        <div className="panel-table-wrap">
          <ErrorState message={error} onRetry={onRetry} />
        </div>
      ) : rows.length === 0 ? (
        <div className="panel-table-wrap">
          <EmptyState
            title={emptyTitle ?? 'Sin registros'}
            message={emptyMessage ?? 'No hay resultados para tu búsqueda.'}
          />
        </div>
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.numeric ? 'panel-table-num' : undefined}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter') onRowClick(row);
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <td key={c.key} className={c.numeric ? 'panel-table-num' : undefined}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel-pagination">
        <span>
          {total > 0 ? `${from}–${to} de ${total}` : 'Sin resultados'}
        </span>
        <div className="panel-pagination-controls">
          {onPageSizeChange && (
            <select
              className="panel-select"
              style={{ width: 'auto' }}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Registros por página"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} / pág.
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="pbtn pbtn--ghost pbtn--sm"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </button>
          <span aria-live="polite">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="pbtn pbtn--ghost pbtn--sm"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
