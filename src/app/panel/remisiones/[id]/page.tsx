'use client';

/**
 * Detalle de remisión: cabecera + partidas (solo lectura) + cadena documental.
 * Acciones gated: Cobrar (con forma de pago) y Cancelar (con motivo) mientras
 * esté 'abierta'; Imprimir siempre disponible.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { SalesNoteDetail } from '@/lib/types/erp-ventas';
import { getSalesNote, cobrarSalesNote, cancelarSalesNote } from '../../_lib/remisiones';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { DocLinesEditor } from '../../_components/DocLinesEditor';
import { DocumentFlow } from '../../_components/DocumentFlow';
import { Drawer } from '../../_components/Drawer';
import { Badge, ErrorState, Spinner } from '../../_components/States';
import {
  MXN,
  PAYMENT_METHODS,
  STATUS_LABEL,
  fmtDate,
  paymentLabel,
  statusTone,
  type PaymentMethod,
} from '../_components/labels';

export default function RemisionDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const can = useCan();
  const { data, loading, error, reload } = useAsyncData(() => getSalesNote(id));

  if (loading) return <Spinner label="Cargando remisión…" />;
  if (error || !data) return <ErrorState message={error ?? 'No encontrada'} onRetry={reload} />;

  return <RemisionDetail note={data} canEdit={can('remisiones', 'editar')} canCancel={can('remisiones', 'cancelar')} onChanged={reload} />;
}

function RemisionDetail({
  note,
  canEdit,
  canCancel,
  onChanged,
}: {
  note: SalesNoteDetail;
  canEdit: boolean;
  canCancel: boolean;
  onChanged: () => void;
}) {
  const isOpen = note.status === 'abierta';
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function cobrar() {
    setBusy(true);
    setActionError(null);
    try {
      await cobrarSalesNote(note.id, method);
      onChanged();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No se pudo cobrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">
            Remisión {note.folio}{' '}
            <Badge tone={statusTone(note.status)}>{STATUS_LABEL[note.status]}</Badge>
          </h2>
          <p className="panel-page-sub">
            {note.customerName ?? 'Público en general'} · {fmtDate(note.createdAt)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <Link className="pbtn pbtn--ghost" href={`/panel/remisiones/${note.id}/print`}>
            Imprimir
          </Link>
        </div>
      </div>

      {actionError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {actionError}
        </p>
      )}

      <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
        <dl className="panel-form-grid" style={{ margin: 0 }}>
          <div>
            <dt className="panel-field-label">Estado</dt>
            <dd>{STATUS_LABEL[note.status]}</dd>
          </div>
          <div>
            <dt className="panel-field-label">Forma de pago</dt>
            <dd>{paymentLabel(note.paymentMethod)}</dd>
          </div>
          <div>
            <dt className="panel-field-label">Cobrada</dt>
            <dd>{fmtDate(note.paidAt)}</dd>
          </div>
          <div>
            <dt className="panel-field-label">Total</dt>
            <dd>
              <strong>{MXN.format(note.total)}</strong>
            </dd>
          </div>
        </dl>
        {note.status === 'cancelada' && note.cancelReason && (
          <p className="panel-field-hint" style={{ marginTop: 'var(--sp-2)' }}>
            Motivo de cancelación: {note.cancelReason}
          </p>
        )}
      </div>

      <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
        <DocLinesEditor customerId={note.customerId} lines={note.items} onChange={() => {}} readOnly />
      </div>

      {isOpen && (canEdit || canCancel) && (
        <div className="panel-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-3)' }}>
          <div className="panel-form-grid" style={{ alignItems: 'end', margin: 0 }}>
            {canEdit && (
              <>
                <div className="panel-field">
                  <label className="panel-field-label" htmlFor="pay-method">
                    Forma de pago
                  </label>
                  <select
                    id="pay-method"
                    className="panel-select"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {paymentLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="pbtn pbtn--primary" disabled={busy} onClick={cobrar}>
                  {busy ? 'Cobrando…' : 'Cobrar'}
                </button>
              </>
            )}
            {canCancel && (
              <button
                type="button"
                className="pbtn pbtn--danger"
                disabled={busy}
                onClick={() => setCancelling(true)}
              >
                Cancelar remisión
              </button>
            )}
          </div>
        </div>
      )}

      <div className="panel-card" style={{ padding: 'var(--sp-4)' }}>
        <h3 className="panel-field-label" style={{ marginBottom: 'var(--sp-2)' }}>
          Cadena documental
        </h3>
        <DocumentFlow type="sales_note" id={note.id} currentLabel={note.folio} />
      </div>

      {cancelling && (
        <CancelDrawer
          noteId={note.id}
          onClose={() => setCancelling(false)}
          onDone={() => {
            setCancelling(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function CancelDrawer({
  noteId,
  onClose,
  onDone,
}: {
  noteId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!motivo.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await cancelarSalesNote(noteId, motivo.trim());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar.');
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      title="Cancelar remisión"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="pbtn pbtn--ghost" onClick={onClose}>
            Volver
          </button>
          <button
            type="button"
            className="pbtn pbtn--danger"
            disabled={!motivo.trim() || saving}
            onClick={submit}
          >
            {saving ? 'Cancelando…' : 'Confirmar cancelación'}
          </button>
        </>
      }
    >
      {error && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {error}
        </p>
      )}
      <div className="panel-field">
        <label className="panel-field-label" htmlFor="cancel-motivo">
          Motivo de cancelación
        </label>
        <textarea
          id="cancel-motivo"
          className="panel-textarea"
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Describe por qué se cancela esta remisión…"
        />
      </div>
    </Drawer>
  );
}
