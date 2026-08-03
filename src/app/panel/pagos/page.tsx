'use client';

/**
 * Tablero de PAGOS (F7 · Tanda B): cobros y pagos consolidados, SOLO LECTURA.
 * Tres KPIs (cobros / pagos / neto del periodo), filtros de fecha y dirección,
 * y una tabla de movimientos. Permiso: pagos/ver. La seguridad real la aplica
 * el servidor (RLS + guard); aquí sólo UX.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  getPayments,
  type PaymentMovement,
  type PaymentTotals,
} from '../_lib/pagos';
import { DataTable, type Column } from '../_components/DataTable';
import { Badge, ErrorState } from '../_components/States';
import { useCan } from '../_components/session';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

type DirFilter = 'all' | 'in' | 'out';

const ZERO: PaymentTotals = { cobros: 0, pagos: 0, neto: 0 };

export default function PagosPage() {
  const can = useCan();
  const allowed = can('pagos', 'ver');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [direction, setDirection] = useState<DirFilter>('all');

  const [rows, setRows] = useState<PaymentMovement[]>([]);
  const [totals, setTotals] = useState<PaymentTotals>(ZERO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Estado de la tabla (paginación/búsqueda del lado cliente).
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    setLoading(true);
    setError(null);
    getPayments({
      from: from || undefined,
      to: to || undefined,
      direction,
    })
      .then((res) => {
        if (!alive) return;
        setRows(res.data);
        setTotals(res.totals);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Error desconocido');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [allowed, from, to, direction, reloadKey]);

  // Búsqueda cliente por contraparte / folio / forma de pago.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (m) =>
        (m.party ?? '').toLowerCase().includes(term) ||
        (m.docFolio ?? '').toLowerCase().includes(term) ||
        m.formaPago.toLowerCase().includes(term),
    );
  }, [rows, search]);

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const columns: Column<PaymentMovement>[] = useMemo(
    () => [
      {
        key: 'date',
        header: 'Fecha',
        render: (m) => m.date?.slice(0, 10) ?? '—',
      },
      {
        key: 'direction',
        header: 'Tipo',
        render: (m) =>
          m.direction === 'in' ? (
            <Badge tone="on">Cobro</Badge>
          ) : (
            <Badge tone="ro">Pago</Badge>
          ),
      },
      {
        key: 'party',
        header: 'Contraparte',
        render: (m) => m.party ?? (m.direction === 'in' ? 'Público en general' : '—'),
      },
      {
        key: 'doc',
        header: 'Documento',
        render: (m) => m.docFolio ?? '—',
      },
      {
        key: 'formaPago',
        header: 'Forma de pago',
        render: (m) => m.formaPago || '—',
      },
      {
        key: 'amount',
        header: 'Monto',
        numeric: true,
        render: (m) => (
          <span
            style={{
              color: m.direction === 'in' ? 'var(--green)' : 'var(--amber)',
              fontWeight: 600,
            }}
          >
            {m.direction === 'in' ? '+' : '−'}
            {MXN.format(m.amount)}
          </span>
        ),
      },
    ],
    [],
  );

  if (!allowed) {
    return (
      <ErrorState
        title="Sin acceso"
        message="No tienes permiso para ver el tablero de pagos."
      />
    );
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Pagos</h2>
          <p className="panel-page-sub">
            Cobros y pagos consolidados del periodo. Solo lectura.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Cobros del periodo</span>
          <span className="kpi-value">{MXN.format(totals.cobros)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Pagos del periodo</span>
          <span className="kpi-value">{MXN.format(totals.pagos)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Neto del periodo</span>
          <span
            className="kpi-value"
            style={{
              color: totals.neto >= 0 ? 'var(--green)' : 'var(--amber)',
            }}
          >
            {MXN.format(totals.neto)}
          </span>
        </div>
      </div>

      <div
        className="panel-card"
        style={{
          padding: 'var(--sp-3)',
          marginBottom: 'var(--sp-3)',
          display: 'flex',
          gap: 'var(--sp-3)',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="kpi-label">Desde</span>
          <input
            type="date"
            className="panel-input"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="kpi-label">Hasta</span>
          <input
            type="date"
            className="panel-input"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="kpi-label">Dirección</span>
          <select
            className="panel-select"
            style={{ width: 'auto' }}
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as DirFilter);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="in">Cobros</option>
            <option value="out">Pagos</option>
          </select>
        </label>
        {(from || to) && (
          <button
            type="button"
            className="pbtn pbtn--ghost pbtn--sm"
            onClick={() => {
              setFrom('');
              setTo('');
              setPage(1);
            }}
          >
            Limpiar fechas
          </button>
        )}
      </div>

      <DataTable<PaymentMovement>
        columns={columns}
        rows={pageRows}
        rowKey={(m) => `${m.direction}-${m.id}`}
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        search={search}
        onSearchChange={(s) => {
          setSearch(s);
          setPage(1);
        }}
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        emptyTitle="Sin movimientos"
        emptyMessage="No hay cobros ni pagos para los filtros seleccionados."
        searchPlaceholder="Buscar por contraparte, folio o forma de pago…"
      />
    </div>
  );
}
