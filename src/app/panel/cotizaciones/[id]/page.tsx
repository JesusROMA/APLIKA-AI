'use client';

/**
 * Detalle de cotización (F1 · Tanda B). Cabecera + partidas (DocLinesEditor
 * readOnly) + cadena documental + acciones según estado y permisos. La edición
 * de un borrador reúsa <QuoteForm> en línea. El server valida cada transición.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { DocLineInput } from '@/lib/types/erp-ventas';
import {
  getQuote,
  updateQuote,
  enviarQuote,
  aceptarQuote,
  rechazarQuote,
  duplicarQuote,
} from '../../_lib/cotizaciones';
import { convertQuoteToOrder } from '../../_lib/ventas-api';
import { useAsyncData } from '../../_lib/hooks';
import { useCan } from '../../_components/session';
import { DocLinesEditor } from '../../_components/DocLinesEditor';
import { DocumentFlow } from '../../_components/DocumentFlow';
import { Badge, Spinner, ErrorState } from '../../_components/States';
import { QuoteForm } from '../_components/QuoteForm';
import { QUOTE_STATUS_LABEL, quoteTone } from '../_components/status';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

export default function CotizacionDetallePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const can = useCan();
  const { data: quote, loading, error, reload } = useAsyncData(() => getQuote(id));

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <Spinner label="Cargando cotización…" />;
  if (error || !quote) return <ErrorState message={error ?? 'No encontrada'} onRetry={reload} />;

  const canEdit = can('cotizaciones', 'editar');
  const canCreate = can('cotizaciones', 'crear');
  const isBorrador = quote.status === 'borrador';
  // 'vencida' es display de una 'enviada' expirada: el server la sigue tratando
  // como enviada, así que las acciones de "enviada" siguen disponibles.
  const isEnviada = quote.status === 'enviada' || quote.status === 'vencida';
  const isAceptada = quote.status === 'aceptada';
  const canCreateOrder = can('ordenes', 'crear');

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(null);
    }
  };

  const rechazar = () => {
    const motivo = window.prompt('Motivo del rechazo (opcional):') ?? undefined;
    runAction('rechazar', () => rechazarQuote(id, motivo));
  };

  if (editing) {
    const initialLines: DocLineInput[] = quote.items.map((l) => ({
      productVariantId: l.productVariantId,
      sku: l.sku,
      name: l.name,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      ivaRate: l.ivaRate,
    }));
    return (
      <div>
        <div className="panel-page-head">
          <div>
            <h2 className="panel-page-title">Editar {quote.folio}</h2>
            <p className="panel-page-sub">Sólo se editan cotizaciones en borrador.</p>
          </div>
        </div>
        <QuoteForm
          canEdit={canEdit}
          submitLabel="Guardar cambios"
          initial={{
            customerId: quote.customerId,
            lines: initialLines,
            descuentoGlobalPct: quote.descuentoGlobalPct,
            vigenciaDias: quote.vigenciaDias,
            notas: quote.notas ?? '',
          }}
          onSubmit={async (body) => {
            await updateQuote(id, body);
            setEditing(false);
            reload();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h2 className="panel-page-title">
            {quote.folio}{' '}
            <Badge tone={quoteTone(quote.status)}>{QUOTE_STATUS_LABEL[quote.status]}</Badge>
          </h2>
          <p className="panel-page-sub">
            {quote.customerName ?? 'Público en general'} · Vigente hasta {fmtDate(quote.validUntil)}
            {quote.version > 1 ? ` · v${quote.version}` : ''}
          </p>
        </div>
        <div className="f1-detail-actions">
          {isBorrador && canEdit && (
            <button
              type="button"
              className="pbtn pbtn--ghost"
              onClick={() => setEditing(true)}
              disabled={Boolean(busy)}
            >
              Editar
            </button>
          )}
          {isBorrador && canEdit && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => runAction('enviar', () => enviarQuote(id))}
              disabled={Boolean(busy)}
            >
              {busy === 'enviar' ? 'Enviando…' : 'Enviar'}
            </button>
          )}
          {isEnviada && canEdit && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() => runAction('aceptar', () => aceptarQuote(id))}
              disabled={Boolean(busy)}
            >
              {busy === 'aceptar' ? 'Aceptando…' : 'Aceptar'}
            </button>
          )}
          {isEnviada && canEdit && (
            <button
              type="button"
              className="pbtn pbtn--ghost"
              onClick={rechazar}
              disabled={Boolean(busy)}
            >
              {busy === 'rechazar' ? 'Rechazando…' : 'Rechazar'}
            </button>
          )}
          {isAceptada && canCreateOrder && (
            <button
              type="button"
              className="pbtn pbtn--primary"
              onClick={() =>
                runAction('convertir', async () => {
                  const { orderId } = await convertQuoteToOrder(id);
                  router.push(`/panel/pedidos/${orderId}`);
                })
              }
              disabled={Boolean(busy)}
            >
              {busy === 'convertir' ? 'Generando pedido…' : 'Convertir a pedido'}
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              className="pbtn pbtn--ghost"
              onClick={() =>
                runAction('duplicar', async () => {
                  const { id: newId } = await duplicarQuote(id);
                  router.push(`/panel/cotizaciones/${newId}`);
                })
              }
              disabled={Boolean(busy)}
            >
              {busy === 'duplicar' ? 'Duplicando…' : 'Duplicar'}
            </button>
          )}
          <Link className="pbtn pbtn--ghost" href={`/panel/cotizaciones/${id}/print`}>
            Imprimir
          </Link>
        </div>
      </div>

      {actionError && (
        <p className="panel-field-error" role="alert" style={{ marginBottom: 'var(--sp-2)' }}>
          {actionError}
        </p>
      )}

      <DocLinesEditor
        customerId={quote.customerId}
        lines={quote.items}
        onChange={() => {}}
        descuentoGlobalPct={quote.descuentoGlobalPct}
        readOnly
      />

      {quote.notas && (
        <section className="panel-field" style={{ marginTop: 'var(--sp-3)' }}>
          <span className="panel-field-label">Notas</span>
          <p>{quote.notas}</p>
        </section>
      )}

      <section style={{ marginTop: 'var(--sp-4)' }}>
        <h3 className="panel-page-sub" style={{ marginBottom: 'var(--sp-2)' }}>
          Cadena documental
        </h3>
        <DocumentFlow type="quote" id={id} currentLabel={quote.folio} />
      </section>

      <p className="panel-field-hint" style={{ marginTop: 'var(--sp-3)' }}>
        Total: {MXN.format(quote.total)}
      </p>
    </div>
  );
}
