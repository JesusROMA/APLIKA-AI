'use client';

/**
 * Detalle de orden de compra (F5 · Tanda B, módulo `compras`). Cabecera (folio,
 * proveedor, almacén, estado, total) + tabla de partidas (Cantidad / Recibido /
 * Pendiente / Costo unit. / Importe). Acciones según estado y permisos:
 *  - Confirmar (borrador → confirmada).
 *  - Recibir   (confirmada / recibida_parcial): drawer para capturar cantidades.
 *  - Cancelar  (sólo si no hay recepciones).
 * Recibir SUMA al inventario con costo (afecta el costo promedio). La UI sólo
 * oculta; el server (RLS + RPC) es la autoridad.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ReceiveLineInput } from '@/lib/types/erp-compras';
import {
  getPurchaseOrder,
  confirmarPurchaseOrder,
  recibirPurchaseOrder,
  cancelarPurchaseOrder,
  PO_STATUS_LABEL,
  poStatusTone,
} from '../../_lib/compras';
import { listWarehouses } from '../../_lib/api';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { Badge, Spinner, ErrorState, ReadOnlyBadge } from '../../_components/States';
import { ReceiveDrawer } from '../_components/ReceiveDrawer';
import { ComprasNav } from '../_components/ComprasNav';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

const CARD: React.CSSProperties = { padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)' };

export default function OrdenCompraDetallePage({ params }: { params: { id: string } }) {
  const can = useCan();
  const { data: po, loading, error, reload } = useAsyncData(() => getPurchaseOrder(params.id));
  const warehouses = useAsyncData(() => listWarehouses({ pageSize: 100 }));

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const warehouseName = useMemo(() => {
    if (!po?.warehouseId) return '—';
    const w = (warehouses.data?.data ?? []).find((x) => x.id === po.warehouseId);
    return w?.name ?? po.warehouseId;
  }, [po?.warehouseId, warehouses.data]);

  if (loading && !po) return <Spinner label="Cargando orden de compra…" />;
  if (error && !po) return <ErrorState message={error} onRetry={reload} />;
  if (!po) return null;

  const canEdit = can('compras', 'editar');
  const canCancel = can('compras', 'cancelar');
  const hasReceipts = po.items.some((it) => Number(it.qtyReceived ?? 0) > 0);

  const showConfirmar = po.status === 'borrador' && canEdit;
  const showRecibir =
    (po.status === 'confirmada' || po.status === 'recibida_parcial') && canEdit;
  const showCancelar =
    canCancel && po.status !== 'cancelada' && po.status !== 'recibida' && !hasReceipts;
  const noActions = !showConfirmar && !showRecibir && !showCancelar;

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

  async function submitReceive(lines: ReceiveLineInput[]) {
    setBusy(true);
    setActionError(null);
    try {
      await recibirPurchaseOrder(params.id, lines);
      setReceiveOpen(false);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No se pudo registrar la recepción.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">
            OC {po.folio}{' '}
            <Badge tone={poStatusTone(po.status)}>{PO_STATUS_LABEL[po.status]}</Badge>
          </h2>
          <p className="panel-page-sub">{po.supplierName ?? '—'}</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/compras">
          Volver
        </Link>
      </div>

      <ComprasNav />

      {actionError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {actionError}
        </p>
      )}

      {/* Cabecera */}
      <div className="panel-card" style={CARD}>
        <div className="panel-form-grid">
          <Meta label="Proveedor" value={po.supplierName ?? '—'} />
          <Meta label="Almacén de destino" value={warehouseName} />
          <Meta label="Fecha esperada" value={fmtDate(po.expectedDate)} />
          <Meta label="Creada" value={fmtDate(po.createdAt)} />
          <Meta label="Subtotal" value={MXN.format(po.subtotal)} />
          <Meta label="IVA" value={MXN.format(po.tax)} />
          <Meta label="Total" value={MXN.format(po.total)} />
        </div>
        {po.notas && (
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <span className="panel-field-label">Notas</span>
            <p style={{ margin: '4px 0 0' }}>{po.notas}</p>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="panel-card" style={CARD}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Acciones
        </h3>
        {showRecibir && (
          <p className="panel-field-hint" style={{ marginTop: 0 }}>
            Recibir <strong>suma al inventario con el costo de la OC</strong> y afecta el costo
            promedio del producto.
          </p>
        )}
        <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', alignItems: 'center' }}>
          {!canEdit && !canCancel && <ReadOnlyBadge />}
          {showConfirmar && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={() => runAction(() => confirmarPurchaseOrder(params.id))}
            >
              Confirmar orden
            </button>
          )}
          {showRecibir && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={() => setReceiveOpen(true)}
            >
              Recibir mercancía
            </button>
          )}
          {showCancelar && (
            <button
              type="button"
              className="pbtn pbtn--danger"
              disabled={busy}
              onClick={() => runAction(() => cancelarPurchaseOrder(params.id))}
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
                <th className="panel-table-num">Recibido</th>
                <th className="panel-table-num">Pendiente</th>
                <th className="panel-table-num">Costo unit.</th>
                <th className="panel-table-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((it) => {
                const received = Number(it.qtyReceived ?? 0);
                const pending = Math.max(0, Number(it.qty) - received);
                return (
                  <tr key={it.id ?? `${it.sku}-${it.name}`}>
                    <td>{it.sku ?? '—'}</td>
                    <td>{it.name}</td>
                    <td className="panel-table-num">{it.qty}</td>
                    <td className="panel-table-num">{received}</td>
                    <td className="panel-table-num">{pending}</td>
                    <td className="panel-table-num">{MXN.format(it.unitCost)}</td>
                    <td className="panel-table-num">{MXN.format(it.lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="panel-table-num">
                  <strong>Total</strong>
                </td>
                <td className="panel-table-num">
                  <strong>{MXN.format(po.total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <ReceiveDrawer
        open={receiveOpen}
        items={po.items}
        busy={busy}
        onClose={() => setReceiveOpen(false)}
        onSubmit={submitReceive}
      />
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
