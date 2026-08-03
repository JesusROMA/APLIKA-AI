'use client';

/**
 * Detalle de factura por cobrar (CxC · F7): cabecera + partidas + pagos, con
 * acción "Registrar pago" (gated facturacion/editar) sobre facturas
 * timbrada / pago_parcial. Misma dinámica que el detalle de CxP.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { InvoiceDetail, InvoiceStatus } from '@/lib/types/erp-ventas';
import { getReceivable, pagarReceivable } from '../../../_lib/cxc';
import { useAsyncData } from '../../../_lib/hooks';
import { useCan } from '../../../_components/session';
import { Badge, Spinner, ErrorState } from '../../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  borrador: 'Borrador',
  timbrada: 'Timbrada',
  pagada: 'Pagada',
  pago_parcial: 'Pago parcial',
  cancelada: 'Cancelada',
};

function statusTone(s: InvoiceStatus): 'on' | 'off' | 'blue' | 'ro' {
  if (s === 'pagada') return 'on';
  if (s === 'cancelada') return 'ro';
  if (s === 'borrador') return 'off';
  return 'blue';
}

export default function CxcDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const can = useCan();
  const detail = useAsyncData(() => getReceivable(id));

  if (detail.loading) return <Spinner label="Cargando factura…" />;
  if (detail.error || !detail.data) {
    return <ErrorState message={detail.error ?? 'No se encontró la factura.'} onRetry={detail.reload} />;
  }

  return <Detail inv={detail.data} canEdit={can('facturacion', 'editar')} onChanged={detail.reload} />;
}

function Detail({
  inv,
  canEdit,
  onChanged,
}: {
  inv: InvoiceDetail;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPago, setShowPago] = useState(false);
  const [monto, setMonto] = useState<string>(inv.saldo != null ? String(inv.saldo) : '');
  const [pagoForma, setPagoForma] = useState('');

  const canPay = inv.status === 'timbrada' || inv.status === 'pago_parcial';

  async function registrarPago() {
    setBusy(true);
    setError(null);
    try {
      await pagarReceivable(inv.id, { monto: Number(monto), formaPago: pagoForma.trim() });
      setShowPago(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La acción falló.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">Factura {inv.folio}</h2>
          <p className="panel-page-sub">{inv.customerName ?? 'Público en general'}</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/facturacion/cxc">
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
            <dd>{DATE.format(new Date(inv.timbradaAt ?? inv.createdAt))}</dd>
          </div>
          <div className="print-meta-row">
            <dt>UUID</dt>
            <dd>{inv.uuid ?? '—'}</dd>
          </div>
          <div className="print-meta-row">
            <dt>Método / Forma</dt>
            <dd>
              {inv.metodoPago}
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

      {inv.items.length > 0 && (
        <div className="panel-table-wrap" style={{ marginBottom: 'var(--sp-3)' }}>
          <table className="panel-table">
            <thead>
              <tr>
                <th>SKU / Descripción</th>
                <th className="panel-table-num">Cantidad</th>
                <th className="panel-table-num">Precio unit.</th>
                <th className="panel-table-num">Importe</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it) => (
                <tr key={it.id ?? it.name}>
                  <td>
                    {it.sku ? `${it.sku} · ` : ''}
                    {it.name}
                  </td>
                  <td className="panel-table-num">{it.qty}</td>
                  <td className="panel-table-num">{MXN.format(it.unitPrice)}</td>
                  <td className="panel-table-num">{MXN.format(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel-toolbar" style={{ marginBottom: 'var(--sp-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap' }}>
          {canEdit && canPay && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy}
              onClick={() => setShowPago((v) => !v)}
            >
              Registrar pago
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
            disabled={busy || !pagoForma.trim() || !(Number(monto) > 0)}
            onClick={registrarPago}
          >
            {busy ? 'Registrando…' : 'Confirmar pago'}
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
