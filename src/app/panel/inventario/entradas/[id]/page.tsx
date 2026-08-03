'use client';

/**
 * Detalle de orden de entrada (F6 · Tanda B, módulo `inventario`). Cabecera
 * (folio, almacén, origen, estado, OC ligada) + tabla de partidas (SKU, producto,
 * cantidad, costo, importe). Acciones según estado y permisos:
 *  - Aplicar  (borrador → aplicada): SUBE el inventario con costo y afecta el
 *    costo promedio; pide confirmación. Es irreversible.
 *  - Cancelar (sólo en borrador).
 * Aplicar/cancelar los ejecuta el server (RLS + RPC); la UI sólo oculta.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getEntryOrder,
  aplicarEntryOrder,
  cancelarEntryOrder,
  ENTRY_STATUS_LABEL,
  entryStatusTone,
  ORIGIN_LABEL,
} from '../../../_lib/entradas';
import { useAsyncData } from '../../../_lib/hooks';
import { useCan } from '../../../_components/session';
import { Badge, Spinner, ErrorState, ReadOnlyBadge } from '../../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

const CARD: React.CSSProperties = { padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' };

export default function EntradaDetallePage({ params }: { params: { id: string } }) {
  const can = useCan();
  const { data: eo, loading, error, reload } = useAsyncData(() => getEntryOrder(params.id));

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const total = useMemo(
    () => (eo ? eo.items.reduce((s, it) => s + it.qty * it.unitCost, 0) : 0),
    [eo],
  );

  if (loading && !eo) return <Spinner label="Cargando orden de entrada…" />;
  if (error && !eo) return <ErrorState message={error} onRetry={reload} />;
  if (!eo) return null;

  const canEdit = can('inventario', 'editar');
  const canCancel = can('inventario', 'cancelar');
  const isBorrador = eo.status === 'borrador';

  const showAplicar = isBorrador && canEdit;
  const showCancelar = isBorrador && canCancel;
  const noActions = !showAplicar && !showCancelar;

  async function aplicar() {
    if (
      !window.confirm(
        'Aplicar esta orden SUBE el inventario con el costo capturado y afecta el costo promedio de los productos. Esta acción no se puede deshacer. ¿Continuar?',
      )
    ) {
      return;
    }
    await runAction(() => aplicarEntryOrder(params.id));
  }

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'La acción no se pudo completar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">
            OE {eo.folio}{' '}
            <Badge tone={entryStatusTone(eo.status)}>{ENTRY_STATUS_LABEL[eo.status]}</Badge>
          </h2>
          <p className="panel-page-sub">
            {eo.warehouseName ?? '—'} · {ORIGIN_LABEL[eo.origin]}
          </p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/inventario/entradas">
          Volver
        </Link>
      </div>

      {actionError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {actionError}
        </p>
      )}

      {/* Cabecera */}
      <div className="panel-card" style={CARD}>
        <div className="panel-form-grid">
          <Meta label="Almacén de destino" value={eo.warehouseName ?? '—'} />
          <Meta label="Origen" value={ORIGIN_LABEL[eo.origin]} />
          <Meta
            label="OC ligada"
            value={eo.purchaseOrderId ? '' : '—'}
            link={
              eo.purchaseOrderId
                ? { href: `/panel/compras/${eo.purchaseOrderId}`, label: 'Ver orden de compra' }
                : undefined
            }
          />
          <Meta label="Creada" value={fmtDate(eo.createdAt)} />
          <Meta label="Aplicada" value={fmtDate(eo.appliedAt)} />
          <Meta label="Total" value={MXN.format(total)} />
        </div>
        {eo.notas && (
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <span className="panel-field-label">Notas</span>
            <p style={{ margin: '4px 0 0' }}>{eo.notas}</p>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="panel-card" style={CARD}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Acciones
        </h3>
        {showAplicar && (
          <p className="panel-field-hint" style={{ marginTop: 0 }}>
            Aplicar <strong>sube el inventario con el costo capturado</strong> y afecta el costo
            promedio del producto. No se puede deshacer.
          </p>
        )}
        <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', alignItems: 'center' }}>
          {!canEdit && !canCancel && <ReadOnlyBadge />}
          {showAplicar && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={aplicar}
            >
              Aplicar entrada
            </button>
          )}
          {showCancelar && (
            <button
              type="button"
              className="pbtn pbtn--danger"
              disabled={busy}
              onClick={() => runAction(() => cancelarEntryOrder(params.id))}
            >
              Cancelar orden
            </button>
          )}
          {noActions && (
            <span className="panel-field-hint">Sin acciones disponibles para este estado.</span>
          )}
        </div>
      </div>

      {/* Partidas */}
      <div className="panel-card" style={CARD}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Partidas
        </h3>
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th className="panel-table-num">Cantidad</th>
                <th className="panel-table-num">Costo unit.</th>
                <th className="panel-table-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {eo.items.map((it) => (
                <tr key={it.id ?? `${it.sku}-${it.name}`}>
                  <td>{it.sku ?? '—'}</td>
                  <td>{it.name}</td>
                  <td className="panel-table-num">{it.qty}</td>
                  <td className="panel-table-num">{MXN.format(it.unitCost)}</td>
                  <td className="panel-table-num">{MXN.format(it.qty * it.unitCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="panel-table-num">
                  <strong>Total</strong>
                </td>
                <td className="panel-table-num">
                  <strong>{MXN.format(total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  link,
}: {
  label: string;
  value: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="panel-field">
      <span className="panel-field-label">{label}</span>
      {link ? (
        <Link
          href={link.href}
          className="pbtn pbtn--ghost pbtn--sm"
          style={{ alignSelf: 'flex-start' }}
        >
          {link.label}
        </Link>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}
