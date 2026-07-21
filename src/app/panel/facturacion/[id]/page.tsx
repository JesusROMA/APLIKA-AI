'use client';

/**
 * Detalle de factura: cabecera fiscal, partidas (solo lectura), pagos y cadena
 * documental. Acciones gated: Timbrar (borrador), Registrar pago (timbrada /
 * pago_parcial), Cancelar (con motivo) e Imprimir.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { InvoiceDetail, InvoiceStatus } from '@/lib/types/erp-ventas';
import {
  getInvoice,
  timbrarInvoice,
  pagarInvoice,
  cancelarInvoice,
} from '../../_lib/facturacion';
import { getVentasCatalogs } from '../../_lib/ventas-api';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { DocLinesEditor } from '../../_components/DocLinesEditor';
import { DocumentFlow } from '../../_components/DocumentFlow';
import { SelectField, type SelectOption } from '../../_components/Field';
import { Badge, Spinner, ErrorState } from '../../_components/States';

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

export default function FacturaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const can = useCan();
  const detail = useAsyncData(() => getInvoice(id));

  if (detail.loading) return <Spinner label="Cargando factura…" />;
  if (detail.error || !detail.data) {
    return <ErrorState message={detail.error ?? 'No se encontró la factura.'} onRetry={detail.reload} />;
  }

  return <FacturaDetail inv={detail.data} canEdit={can('facturacion', 'editar')} canCancel={can('facturacion', 'cancelar')} onChanged={detail.reload} />;
}

function FacturaDetail({
  inv,
  canEdit,
  canCancel,
  onChanged,
}: {
  inv: InvoiceDetail;
  canEdit: boolean;
  canCancel: boolean;
  onChanged: () => void;
}) {
  const catalogs = useAsyncData(getVentasCatalogs);
  const [busy, setBusy] = useState<null | 'timbrar' | 'pago' | 'cancelar'>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPago, setShowPago] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [monto, setMonto] = useState<string>(inv.saldo != null ? String(inv.saldo) : '');
  const [pagoForma, setPagoForma] = useState('');
  const [motivo, setMotivo] = useState('');

  const formaOpts: SelectOption[] = useMemo(
    () => (catalogs.data?.formaPago ?? []).map((f) => ({ value: f.code, label: `${f.code} · ${f.label}` })),
    [catalogs.data],
  );

  const totals = { subtotal: inv.subtotal, descuento: 0, tax: inv.tax, total: inv.total };
  const canPay = inv.status === 'timbrada' || inv.status === 'pago_parcial';

  async function run(kind: 'timbrar' | 'pago' | 'cancelar', fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      setShowPago(false);
      setShowCancel(false);
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
          <h2 className="panel-page-title">
            Factura {inv.serie}-{inv.folio}
          </h2>
          <p className="panel-page-sub">{inv.customerName ?? 'Público en general'}</p>
        </div>
        <Link className="pbtn pbtn--ghost" href="/panel/facturacion">
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
            <dt>UUID (folio fiscal)</dt>
            <dd>{inv.uuid ?? '— sin timbrar —'}</dd>
          </div>
          <div className="print-meta-row">
            <dt>Método</dt>
            <dd>{inv.metodoPago}{inv.formaPago ? ` · Forma ${inv.formaPago}` : ''}</dd>
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
          {canEdit && inv.status === 'borrador' && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              disabled={busy !== null}
              onClick={() => run('timbrar', () => timbrarInvoice(inv.id))}
            >
              {busy === 'timbrar' ? 'Timbrando…' : 'Timbrar'}
            </button>
          )}
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
          {canCancel && inv.status !== 'cancelada' && (
            <button
              type="button"
              className="pbtn pbtn--ghost"
              disabled={busy !== null}
              onClick={() => setShowCancel((v) => !v)}
            >
              Cancelar factura
            </button>
          )}
          <Link className="pbtn pbtn--ghost" href={`/panel/facturacion/${inv.id}/print`}>
            Imprimir
          </Link>
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
            <SelectField
              label="Forma de pago"
              name="pagoForma"
              value={pagoForma}
              onChange={setPagoForma}
              options={formaOpts}
              placeholder="Selecciona…"
            />
          </div>
          <button
            type="button"
            className="pbtn pbtn--primary"
            disabled={busy !== null || !pagoForma || !(Number(monto) > 0)}
            onClick={() =>
              run('pago', () => pagarInvoice(inv.id, { monto: Number(monto), formaPago: pagoForma }))
            }
          >
            {busy === 'pago' ? 'Registrando…' : 'Confirmar pago'}
          </button>
        </div>
      )}

      {showCancel && (
        <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
          <h3 className="panel-page-title" style={{ fontSize: '1rem' }}>Cancelar factura</h3>
          <div className="panel-field">
            <label className="panel-field-label" htmlFor="cancel-motivo">Motivo de cancelación</label>
            <input
              id="cancel-motivo"
              type="text"
              className="panel-input"
              value={motivo}
              placeholder="Motivo SAT o descripción"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="pbtn pbtn--primary"
            disabled={busy !== null || !motivo.trim()}
            onClick={() => run('cancelar', () => cancelarInvoice(inv.id, motivo.trim()))}
          >
            {busy === 'cancelar' ? 'Cancelando…' : 'Confirmar cancelación'}
          </button>
        </div>
      )}

      <h3 className="panel-page-title" style={{ fontSize: '1rem', marginBottom: 'var(--sp-2)' }}>Partidas</h3>
      <DocLinesEditor customerId={inv.customerId} lines={inv.items} onChange={() => {}} readOnly />

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
                <th>REP (UUID)</th>
              </tr>
            </thead>
            <tbody>
              {inv.payments.map((p) => (
                <tr key={p.id}>
                  <td>{DATE.format(new Date(p.fecha))}</td>
                  <td className="panel-table-num">{MXN.format(p.monto)}</td>
                  <td>{p.formaPago}</td>
                  <td>{p.isRep ? p.uuidRep ?? 'timbrado' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="panel-page-title" style={{ fontSize: '1rem', margin: 'var(--sp-4) 0 var(--sp-2)' }}>Cadena documental</h3>
      <DocumentFlow type="invoice" id={inv.id} currentLabel={`${inv.serie}-${inv.folio}`} />

      {/* Totales de referencia */}
      <div className="f1-totals" style={{ marginTop: 'var(--sp-3)' }}>
        <div className="f1-totals-row">
          <span className="f1-totals-label">Subtotal</span>
          <span className="f1-totals-value">{MXN.format(totals.subtotal)}</span>
        </div>
        <div className="f1-totals-row">
          <span className="f1-totals-label">IVA</span>
          <span className="f1-totals-value">{MXN.format(totals.tax)}</span>
        </div>
        <div className="f1-totals-row f1-totals-row--grand">
          <span className="f1-totals-label">Total</span>
          <span className="f1-totals-value">{MXN.format(totals.total)}</span>
        </div>
      </div>
    </div>
  );
}
