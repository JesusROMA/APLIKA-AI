'use client';

/**
 * Detalle de pedido (F1 · Tanda B, módulo `ordenes`). Cabecera + partidas
 * (DocLinesEditor readOnly con columna "entregado"), cadena documental, y dos
 * bloques de acción:
 *  - Pipeline: avanza al siguiente estado válido + cancelar (RPC transition_order).
 *  - Entregas: registra entrega por partida ≤ pendiente (RPC record_delivery).
 * La UI sólo oculta; el server (RLS + RPC) es la autoridad.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DocLineInput, OrderStatus } from '@/lib/types/erp-ventas';
import {
  getOrder,
  transitionOrder,
  deliverOrder,
  ORDER_STATUS_LABEL,
  orderStatusTone,
} from '../../_lib/pedidos';
import { convertOrderToInvoice } from '../../_lib/ventas-api';
import { listWarehouses } from '../../_lib/api';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { DocLinesEditor } from '../../_components/DocLinesEditor';
import { DocumentFlow } from '../../_components/DocumentFlow';
import { Badge, Spinner, ErrorState, ReadOnlyBadge } from '../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

/** Siguiente transición manual del pipeline (las entregas fijan surtido). */
const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  borrador: { status: 'confirmado', label: 'Confirmar' },
  confirmado: { status: 'pagado', label: 'Marcar pagado' },
  surtido: { status: 'facturado', label: 'Marcar facturado' },
  facturado: { status: 'enviado', label: 'Marcar enviado' },
};

const DELIVERABLE: OrderStatus[] = ['pagado', 'surtido_parcial'];

const CARD: React.CSSProperties = {
  padding: 'var(--sp-3)',
  marginBottom: 'var(--sp-3)',
};

export default function PedidoDetallePage({ params }: { params: { id: string } }) {
  const can = useCan();
  const router = useRouter();
  const { data: order, loading, error, reload } = useAsyncData(() => getOrder(params.id));
  const warehouses = useAsyncData(() => listWarehouses({ pageSize: 100 }));

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deliverDraft, setDeliverDraft] = useState<Record<string, string>>({});

  const warehouseName = useMemo(() => {
    if (!order?.warehouseId) return null;
    return warehouses.data?.data.find((w) => w.id === order.warehouseId)?.name ?? null;
  }, [order?.warehouseId, warehouses.data]);

  if (loading && !order) return <Spinner label="Cargando pedido…" />;
  if (error && !order) return <ErrorState message={error} onRetry={reload} />;
  if (!order) return null;

  const editorLines: DocLineInput[] = order.items.map((it) => ({
    productVariantId: it.productVariantId,
    sku: it.sku,
    name: it.name,
    qty: it.qty,
    unitPrice: it.unitPrice,
    discountPct: it.discountPct,
    ivaRate: it.ivaRate,
  }));
  const deliveredByIndex = order.items.map((it) => it.qtyDelivered ?? 0);

  const canEdit = can('ordenes', 'editar');
  const canCancel = can('ordenes', 'cancelar');
  const next = NEXT[order.status];
  const showCancel = !['cancelada', 'enviado'].includes(order.status);
  const canInvoice =
    order.status !== 'cancelada' && Boolean(order.customerId) && can('facturacion', 'crear');
  const showDeliver = DELIVERABLE.includes(order.status) && canEdit;
  const pendingLines = order.items.filter((it) => it.id && (it.qty - (it.qtyDelivered ?? 0)) > 0);

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

  async function submitDelivery() {
    const lines = order!.items
      .filter((it) => it.id && Number(deliverDraft[it.id] ?? '') > 0)
      .map((it) => ({ itemId: it.id!, qty: Math.round(Number(deliverDraft[it.id!])) }));
    if (lines.length === 0) {
      setActionError('Indica una cantidad a entregar en al menos una partida.');
      return;
    }
    await runAction(async () => {
      await deliverOrder(params.id, lines);
      setDeliverDraft({});
    });
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">
            Pedido {order.folio}{' '}
            <Badge tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABEL[order.status]}</Badge>
          </h2>
          <p className="panel-page-sub">{order.customerName ?? 'Público en general'}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-1)' }}>
          <Link className="pbtn pbtn--ghost" href={`/panel/pedidos/${order.id}/print`}>
            Imprimir
          </Link>
          <Link className="pbtn pbtn--ghost" href="/panel/pedidos">
            Volver
          </Link>
        </div>
      </div>

      {actionError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {actionError}
        </p>
      )}

      {/* Cabecera */}
      <div className="panel-card" style={CARD}>
        <div className="panel-form-grid">
          <Meta label="Cliente" value={order.customerName ?? 'Público en general'} />
          <Meta label="Canal" value={order.channel ?? '—'} />
          <Meta label="Almacén" value={warehouseName ?? (order.warehouseId ? '—' : 'Sin asignar')} />
          <Meta label="Fecha" value={fmtDate(order.createdAt)} />
          <Meta label="Inventario" value={order.stockApplied ? 'Aplicado' : 'Pendiente'} />
          <Meta label="Total" value={MXN.format(order.total)} />
        </div>
        {order.notes && (
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <span className="panel-field-label">Notas</span>
            <p style={{ margin: '4px 0 0' }}>{order.notes}</p>
          </div>
        )}
      </div>

      {/* Pipeline */}
      <div className="panel-card" style={CARD}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Pipeline
        </h3>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', alignItems: 'center' }}>
          {!canEdit && !canCancel && <ReadOnlyBadge />}
          {next && canEdit && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={() => runAction(() => transitionOrder(params.id, next.status))}
            >
              {next.label}
            </button>
          )}
          {canInvoice && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  const { invoiceId } = await convertOrderToInvoice(params.id);
                  router.push(`/panel/facturacion/${invoiceId}`);
                })
              }
            >
              Convertir a factura
            </button>
          )}
          {showCancel && canCancel && (
            <button
              type="button"
              className="pbtn pbtn--danger"
              disabled={busy}
              onClick={() => runAction(() => transitionOrder(params.id, 'cancelada'))}
            >
              Cancelar pedido
            </button>
          )}
          {!next && !showCancel && (
            <span className="panel-field-hint">Sin acciones de pipeline disponibles.</span>
          )}
        </div>
      </div>

      {/* Entregas */}
      {showDeliver && (
        <div className="panel-card" style={CARD}>
          <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
            Registrar entrega
          </h3>
          {pendingLines.length === 0 ? (
            <p className="panel-field-hint">No hay partidas pendientes por entregar.</p>
          ) : (
            <>
              <div className="panel-table-wrap">
                <table className="panel-table">
                  <thead>
                    <tr>
                      <th>Partida</th>
                      <th className="panel-table-num">Pedido</th>
                      <th className="panel-table-num">Entregado</th>
                      <th className="panel-table-num">Pendiente</th>
                      <th className="panel-table-num">Entregar ahora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingLines.map((it) => {
                      const pending = it.qty - (it.qtyDelivered ?? 0);
                      return (
                        <tr key={it.id}>
                          <td>
                            {it.sku && <span className="f1-line-sku">{it.sku}</span>}{' '}
                            <span className="f1-line-name">{it.name}</span>
                          </td>
                          <td className="panel-table-num">{it.qty}</td>
                          <td className="panel-table-num">{it.qtyDelivered ?? 0}</td>
                          <td className="panel-table-num">{pending}</td>
                          <td className="panel-table-num">
                            <input
                              type="number"
                              className="panel-input f1-num"
                              min={0}
                              max={pending}
                              step={1}
                              value={deliverDraft[it.id!] ?? ''}
                              aria-label={`Cantidad a entregar de ${it.name}`}
                              onChange={(e) =>
                                setDeliverDraft((d) => ({ ...d, [it.id!]: e.target.value }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="pbtn pbtn--primary"
                  disabled={busy}
                  onClick={submitDelivery}
                >
                  {busy ? 'Registrando…' : 'Registrar entrega'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Partidas */}
      <div className="panel-card" style={CARD}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Partidas
        </h3>
        <DocLinesEditor
          customerId={order.customerId}
          lines={editorLines}
          onChange={() => {}}
          readOnly
          showDelivered
          deliveredByIndex={deliveredByIndex}
        />
      </div>

      {/* Cadena documental */}
      <div className="panel-card" style={CARD}>
        <h3 className="panel-page-sub" style={{ marginTop: 0, fontWeight: 700 }}>
          Documentos relacionados
        </h3>
        <DocumentFlow type="order" id={order.id} currentLabel={order.folio} />
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
