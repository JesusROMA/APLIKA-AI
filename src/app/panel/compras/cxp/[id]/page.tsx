'use client';

/**
 * Detalle de factura de proveedor: cabecera + pagos. Acciones gated: Registrar
 * pago (registrada / pago_parcial) y Cancelar (sin pagos). Solo lectura para el
 * resto.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { SupplierInvoiceDetail, SupplierInvoiceStatus } from '@/lib/types/erp-compras';
import {
  getSupplierInvoice,
  pagarSupplierInvoice,
  cancelarSupplierInvoice,
} from '../../../_lib/cxp';
import { useAsyncData } from '../../../_lib/hooks';
import { useCan } from '../../../_components/session';
import { Badge, Spinner, ErrorState } from '../../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

const STATUS_LABEL: Record<SupplierInvoiceStatus, string> = {
  borrador: 'Borrador',
  registrada: 'Registrada',
  pagada: 'Pagada',
  pago_parcial: 'Pago parcial',
  cancelada: 'Cancelada',
};

function statusTone(s: SupplierInvoiceStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (s === 'pagada') return 'on';
  if (s === 'cancelada') return 'ro';
  if (s === 'borrador') return 'off';
  return 'blue';
}

export default function SupplierInvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const can = useCan();
  const detail = useAsyncData(() => getSupplierInvoice(id));

  if (detail.loading) return <Spinner label="Cargando factura…" />;
  if (detail.error || !detail.data) {
    return <ErrorState message={detail.error ?? 'No se encontró la factura.'} onRetry={detail.reload} />;
  }

  return (
    <Detail
      inv={detail.data}
      canEdit={can('compras', 'editar')}
      canCancel={can('compras', 'cancelar')}
      onChanged={detail.reload}
    />
  );
}

function Detail({
  inv,
  canEdit,
  canCancel,
  onChanged,
}: {
  inv: SupplierInvoiceDetail;
  canEdit: boolean;
  canCancel: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<null | 'pago' | 'cancelar'>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPago, setShowPago] = useState(false);
  const [monto, setMonto] = useState<string>(inv.saldo != null ? String(inv.saldo) : '');
  const [pagoForma, setPagoForma] = useState('');

  const canPay = inv.status === 'registrada' || inv.status === 'pago_parcial';
  const canDoCancel = inv.status !== 'cancelada' && inv.payments.length === 0;

  async function run(kind: 'pago' | 'cancelar', fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      setShowPago(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La acción falló.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Factura {inv.folio}</h2>
          <p className="panel-page-sub">{inv.supplierName ?? '—'}</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/compras/cxp">
          Volver
        </Link>
      </div>

      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}

      <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
        <dl className="print-meta" style={{ margin: 0 }}>
          <div className="print-meta-row">
            <dt>Estado</dt>
            <dd>
              <Badge tone={statusTone(inv.status)}>{STATUS_LABEL[inv.status]}</Badge>
            </dd>
          </div>
          <div className="print-meta-row">
            <dt>Fecha</dt>
            <dd>{DATE.format(new Date(inv.fecha))}</dd>
          </div>
          <div className="print-meta-row">
            <dt>UUID</dt>
            <dd>{inv.uuid ?? '—'}</dd>
          </div>
          <div className="print-meta-row">
            <dt>Método / Forma</dt>
            <dd>
              {inv.metodoPago ?? '—'}
              {inv.formaPago ? ` · ${inv.formaPago}` : ''}
            </dd>
          </div>
          <div className="print-meta-row">
            <dt>Subtotal</dt>
            <dd>{MXN.format(inv.subtotal)}</dd>
          </div>
          <div className="print-meta-row">
            <dt>IVA</dt>
            <dd>{MXN.format(inv.tax)}</dd>
          </div>
          <div className="print-meta-row">
            <dt>Total</dt>
            <dd>{MXN.format(inv.total)}</dd>
          </div>
          <div className="print-meta-row">
            <dt>Saldo</dt>
            <dd>{inv.saldo === null ? '—' : MXN.format(inv.saldo)}</dd>
          </div>
        </dl>
      </div>

      <div className="panel-toolbar" style={{ marginBottom: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap' }}>
          {canEdit && canPay && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy !== null}
              onClick={() => setShowPago((v) => !v)}
            >
              Registrar pago
            </button>
          )}
          {canCancel && canDoCancel && (
            <button
              type="button"
              className="pbtn pbtn--ghost"
              disabled={busy !== null}
              onClick={() => run('cancelar', () => cancelarSupplierInvoice(inv.id))}
            >
              {busy === 'cancelar' ? 'Cancelando…' : 'Cancelar factura'}
            </button>
          )}
        </div>
      </div>

      {showPago && canPay && (
        <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
          <h3 className="panel-page-title" style={{ fontSize: '1rem' }}>Registrar pago</h3>
          <div className="panel-form-grid">
            <div className="panel-field">
              <label className="panel-field-label" htmlFor="pago-monto">Monto (MXN)</label>
              <input
                id="pago-monto"
                type="number"
                className="panel-input"
                value={monto}
                min={0}
                step="any"
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
            <div className="panel-field">
              <label className="panel-field-label" htmlFor="pago-forma">Forma de pago</label>
              <input
                id="pago-forma"
                type="text"
                className="panel-input"
                value={pagoForma}
                placeholder="Transferencia, efectivo…"
                onChange={(e) => setPagoForma(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="pbtn pbtn--primary"
            disabled={busy !== null || !pagoForma.trim() || !(Number(monto) > 0)}
            onClick={() =>
              run('pago', () => pagarSupplierInvoice(inv.id, { monto: Number(monto), formaPago: pagoForma.trim() }))
            }
          >
            {busy === 'pago' ? 'Registrando…' : 'Confirmar pago'}
          </button>
        </div>
      )}

      <h3 className="panel-page-title" style={{ fontSize: '1rem', margin: 'var(--sp-4) 0 var(--sp-2)' }}>Pagos</h3>
      {inv.payments.length === 0 ? (
        <p className="panel-page-sub">Sin pagos registrados.</p>
      ) : (
        <div className="panel-table-wrap">
          <table className="panel-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="panel-table-num">Monto</th>
                <th>Forma</th>
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id}>
                  <td>{DATE.format(new Date(p.fecha))}</td>
                  <td className="panel-table-num">{MXN.format(p.monto)}</td>
                  <td>{p.formaPago}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
