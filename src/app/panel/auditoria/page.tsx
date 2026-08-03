'use client';

/**
 * Bitácora / auditoría (F4 · Tanda B, AGENTE-AUDIT).
 * Tabla paginada de `audit_log` bajo RLS: fecha, actor, entidad, acción y el
 * `detail` (jsonb) expandible en un drawer. Filtros: tipo de entidad, acción y
 * rango de fechas. La visibilidad la impone la RLS (super_admin o tenant_admin
 * de la org); si el rol no puede ver, el server responde 403 → estado claro.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Paginated } from '@/lib/types/erp';
import type { AuditRow } from '@/lib/types/erp-config';
import { listAudit } from '../_lib/auditoria';
import { ApiError } from '../_lib/api';
import { DataTable, type Column } from '../_components/DataTable';
import { Drawer } from '../_components/Drawer';
import { Badge } from '../_components/States';

const DT = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Recorta ids largos (uuid) para la celda de entidad. */
function shortId(id: string): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** Preview de una línea del jsonb para la celda/tooltip. */
function detailPreview(detail: Record<string, unknown>): string {
  const keys = Object.keys(detail ?? {});
  if (keys.length === 0) return '—';
  try {
    return JSON.stringify(detail);
  } catch {
    return `${keys.length} campo(s)`;
  }
}

export default function AuditoriaPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<Paginated<AuditRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [detail, setDetail] = useState<AuditRow | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listAudit({
      page,
      pageSize,
      entityType: entityType || undefined,
      action: action || undefined,
      from: from || undefined,
      to: to || undefined,
    })
      .then((res) => {
        if (!alive) return;
        setForbidden(false);
        setData(res);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 403) {
          setForbidden(true);
          setData(null);
          return;
        }
        setError(e instanceof Error ? e.message : 'Error desconocido');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, pageSize, entityType, action, from, to, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Al cambiar un filtro, vuelve a la página 1.
  const onFilter = useCallback(<T,>(setter: (v: T) => void) => {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }, []);

  const columns: Column<AuditRow>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        header: 'Fecha',
        render: (r) => DT.format(new Date(r.createdAt)),
      },
      {
        key: 'actor',
        header: 'Actor',
        render: (r) => r.actorName ?? (r.actorId ? shortId(r.actorId) : 'Sistema'),
      },
      {
        key: 'entity',
        header: 'Entidad',
        render: (r) => (
          <span title={r.entityId}>
            <strong>{r.entityType}</strong>
            <span style={{ color: 'var(--ink-55)' }}> · {shortId(r.entityId)}</span>
          </span>
        ),
      },
      {
        key: 'action',
        header: 'Acción',
        render: (r) => <Badge tone="blue">{r.action}</Badge>,
      },
      {
        key: 'detail',
        header: 'Detalle',
        render: (r) => {
          const preview = detailPreview(r.detail);
          return (
            <span
              title={preview}
              style={{
                display: 'inline-block',
                maxWidth: 320,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                verticalAlign: 'bottom',
                color: 'var(--ink-55)',
              }}
            >
              {preview}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Bitácora</h2>
          <p className="panel-page-sub">
            Registro de eventos del sistema. Sólo el dueño de la cuenta puede consultarla.
          </p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/config">
          ← Volver a Configuración
        </Link>
      </div>

      <div
        className="panel-toolbar"
        style={{ gap: 'var(--sp-2)', flexWrap: 'wrap' }}
        role="group"
        aria-label="Filtros de la bitácora"
      >
        <input
          type="text"
          className="panel-input"
          style={{ width: 'auto' }}
          placeholder="Tipo de entidad…"
          value={entityType}
          onChange={(e) => onFilter(setEntityType)(e.target.value)}
          aria-label="Filtrar por tipo de entidad"
        />
        <input
          type="text"
          className="panel-input"
          style={{ width: 'auto' }}
          placeholder="Acción…"
          value={action}
          onChange={(e) => onFilter(setAction)(e.target.value)}
          aria-label="Filtrar por acción"
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-1)' }}>
          <span style={{ color: 'var(--ink-55)', fontSize: 'var(--fs-small)' }}>Desde</span>
          <input
            type="date"
            className="panel-input"
            style={{ width: 'auto' }}
            value={from}
            max={to || undefined}
            onChange={(e) => onFilter(setFrom)(e.target.value)}
            aria-label="Fecha desde"
          />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-1)' }}>
          <span style={{ color: 'var(--ink-55)', fontSize: 'var(--fs-small)' }}>Hasta</span>
          <input
            type="date"
            className="panel-input"
            style={{ width: 'auto' }}
            value={to}
            min={from || undefined}
            onChange={(e) => onFilter(setTo)(e.target.value)}
            aria-label="Fecha hasta"
          />
        </label>
        {(entityType || action || from || to) && (
          <button
            type="button"
            className="pbtn pbtn--ghost pbtn--sm"
            onClick={() => {
              setEntityType('');
              setAction('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {forbidden ? (
        <div className="panel-table-wrap" style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
          <p className="panel-page-title" style={{ fontSize: 'var(--fs-card-title)' }}>
            Solo el dueño puede ver la bitácora
          </p>
          <p className="panel-page-sub">
            Tu rol no tiene acceso al registro de auditoría de esta organización.
          </p>
        </div>
      ) : (
        <AuditTable
          columns={columns}
          data={data}
          loading={loading}
          error={error}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
          onRetry={reload}
          onRowClick={setDetail}
        />
      )}

      <Drawer
        open={detail !== null}
        title="Detalle del evento"
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
            <DetailRow label="Fecha" value={DT.format(new Date(detail.createdAt))} />
            <DetailRow label="Actor" value={detail.actorName ?? detail.actorId ?? 'Sistema'} />
            <DetailRow label="Entidad" value={`${detail.entityType} · ${detail.entityId}`} />
            <DetailRow label="Acción" value={detail.action} />
            <div>
              <div
                style={{
                  color: 'var(--ink-55)',
                  fontSize: 'var(--fs-small)',
                  marginBottom: 'var(--sp-1)',
                }}
              >
                Detalle (JSON)
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 'var(--sp-2)',
                  background: 'var(--surface)',
                  borderRadius: 'var(--r-sm)',
                  overflowX: 'auto',
                  fontSize: 'var(--fs-small)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(detail.detail ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

/** Fila etiqueta/valor del drawer de detalle. */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: 'var(--ink-55)', fontSize: 'var(--fs-small)' }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

/** Envoltura de DataTable: la bitácora no usa búsqueda de texto libre. */
function AuditTable({
  columns,
  data,
  loading,
  error,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRetry,
  onRowClick,
}: {
  columns: Column<AuditRow>[];
  data: Paginated<AuditRow> | null;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  onRetry: () => void;
  onRowClick: (r: AuditRow) => void;
}) {
  return (
    <DataTable
      columns={columns}
      rows={data?.data ?? []}
      rowKey={(r) => String(r.id)}
      page={page}
      pageSize={pageSize}
      total={data?.total ?? 0}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      search=""
      onSearchChange={() => {}}
      loading={loading}
      error={error}
      onRetry={onRetry}
      onRowClick={onRowClick}
      emptyTitle="Sin eventos"
      emptyMessage="No hay eventos que coincidan con los filtros."
    />
  );
}
