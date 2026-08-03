'use client';

/**
 * Vista imprimible de una cotización (F1 · Tanda B). Carga el detalle y arma el
 * PrintableDoc para <PrintDocument>. Los totales se recomponen con las fórmulas
 * compartidas (client-safe) para incluir el descuento global. Se renderiza sin
 * sidebar (PanelShell detecta la ruta /print).
 */

import { useParams } from 'next/navigation';
import { computeTotals } from '@/lib/erp/totals';
import { getQuote } from '../../../_lib/cotizaciones';
import { useAsyncData } from '../../../_lib/hooks';
import { useSession } from '../../../_components/session';
import { PrintDocument, type PrintableDoc } from '../../../_components/PrintDocument';
import { Spinner, ErrorState } from '../../../_components/States';
import { QUOTE_STATUS_LABEL } from '../../_components/status';

const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

export default function CotizacionPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const session = useSession();
  const { data: quote, loading, error, reload } = useAsyncData(() => getQuote(id));

  if (loading) return <Spinner label="Preparando impresión…" />;
  if (error || !quote) return <ErrorState message={error ?? 'No encontrada'} onRetry={reload} />;

  const totals = computeTotals(quote.items, quote.descuentoGlobalPct);

  const doc: PrintableDoc = {
    orgName: session.organization?.name ?? 'Aplika.ai',
    brandColor: session.organization?.brandColor ?? undefined,
    logoUrl: session.organization?.logoUrl ?? undefined,
    docTitle: 'Cotización',
    folio: quote.folio,
    status: QUOTE_STATUS_LABEL[quote.status],
    date: quote.createdAt,
    customer: quote.customerId ? { name: quote.customerName ?? 'Cliente', rfc: null } : null,
    lines: quote.items,
    totals,
    meta: [
      { label: 'Vigencia', value: fmtDate(quote.validUntil) },
      { label: 'Estado', value: QUOTE_STATUS_LABEL[quote.status] },
    ],
    notes: quote.notas,
  };

  return <PrintDocument doc={doc} />;
}
