'use client';

/**
 * Detalle de traspaso (F2 · Tanda B, módulo `inventario`). Cabecera
 * (origen → destino, estado, fechas) + tabla de partidas (SKU, producto,
 * cantidad, costo unitario si ya viajó) y acciones según estado/permiso:
 *  - Enviar   (borrador → en_transito): salida del origen, captura de costo.
 *  - Recibir  (en_transito → recibido): entrada al destino con el costo que viajó.
 *  - Cancelar (solo borrador).
 * La UI sólo oculta; el server (RLS + RPC) es la autoridad.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  getTransfer,
  enviarTransfer,
  recibirTransfer,
  cancelarTransfer,
  TRANSFER_STATUS_LABEL,
  transferStatusTone,
} from '../../../_lib/traspasos';
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

const CARD: React.CSSProperties = {
  padding: 'var(--sp-3)',
  marginBottom: 'var(--sp-3)',
};

export default function TraspasoDetallePage({ params }: { params: { id: string } }) {
  const can = useCan();
  const { data: transfer, loading, error, reload } = useAsyncData(() => getTransfer(params.id));

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !transfer) return <Spinner label="Cargando traspaso…" />;
  if (error && !transfer) return <ErrorState message={error} onRetry={reload} />;
  if (!transfer) return null;

  const canEdit = can('inventario', 'editar');
  const canCancel = can('inventario', 'cancelar');
  const showEnviar = transfer.status === 'borrador' && canEdit;
  const showRecibir = transfer.status === 'en_transito' && canEdit;
  const showCancelar = transfer.status === 'borrador' && canCancel;
  const shipped = transfer.status !== 'borrador' && transfer.status !== 'cancelada';
  const noActions = !showEnviar && !showRecibir && !showCancelar;

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
            Traspaso {transfer.folio}{' '}
            <Badge tone={transferStatusTone(transfer.status)}>
              {TRANSFER_STATUS_LABEL[transfer.status]}
            </Badge>
          </h2>
          <p className="panel-page-sub">
            {transfer.fromWarehouseName ?? '—'} → {transfer.toWarehouseName ?? '—'}
          </p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/inventario/traspasos">
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
          <Meta label="Origen" value={transfer.fromWarehouseName ?? '—'} />
          <Meta label="Destino" value={transfer.toWarehouseName ?? '—'} />
          <Meta label="Partidas" value={String(transfer.itemCount)} />
          <Meta label="Creado" value={fmtDate(transfer.createdAt)} />
          <Meta label="Enviado" value={fmtDate(transfer.shippedAt)} />
          <Meta label="Recibido" value={fmtDate(transfer.receivedAt)} />
        </div>
        {transfer.notas && (
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <span className="panel-field-label">Notas</span>
            <p style={{ margin: '4px 0 0' }}>{transfer.notas}</p>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="panel-card" style={CARD}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Acciones
        </h3>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', alignItems: 'center' }}>
          {!canEdit && !canCancel && <ReadOnlyBadge />}
          {showEnviar && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={() => runAction(() => enviarTransfer(params.id))}
            >
              Enviar (salida del origen)
            </button>
          )}
          {showRecibir && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={() => runAction(() => recibirTransfer(params.id))}
            >
              Recibir (entrada al destino)
            </button>
          )}
          {showCancelar && (
            <button
              type="button"
              className="pbtn pbtn--danger"
              disabled={busy}
              onClick={() => runAction(() => cancelarTransfer(params.id))}
            >
              Cancelar traspaso
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
                <th className="panel-table-num">Costo unitario</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.sku ?? '—'}</td>
                  <td>{it.name}</td>
                  <td className="panel-table-num">{it.qty}</td>
                  <td className="panel-table-num">
                    {it.unitCost == null
                      ? shipped
                        ? '—'
                        : 'Al enviar'
                      : MXN.format(it.unitCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-field">
      <span className="panel-field-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}
