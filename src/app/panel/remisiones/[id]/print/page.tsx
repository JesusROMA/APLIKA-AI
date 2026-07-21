'use client';

/**
 * Vista imprimible de una remisión. Monta <PrintDocument> con el branding del
 * tenant (useSession) y los datos del documento. Se renderiza sin sidebar
 * (PanelShell detecta las rutas /print).
 */

import type { PrintableDoc } from '../../../_components/PrintDocument';
import { PrintDocument } from '../../../_components/PrintDocument';
import { getSalesNote } from '../../../_lib/remisiones';
import { useAsyncData } from '../../../_lib/hooks';
import { useSession } from '../../../_components/session';
import { ErrorState, Spinner } from '../../../_components/States';
import { STATUS_LABEL, paymentLabel } from '../../_components/labels';

export default function RemisionPrintPage({ params }: { params: { id: string } }) {
  const session = useSession();
  const { data, loading, error, reload } = useAsyncData(() => getSalesNote(params.id));

  if (loading) return <Spinner label="Preparando impresión…" />;
  if (error || !data) return <ErrorState message={error ?? 'Remisión no encontrada'} onRetry={reload} />;

  const doc: PrintableDoc = {
    orgName: session.organization?.name ?? 'Aplika.ai',
    docTitle: 'Remisión',
    folio: data.folio,
    status: STATUS_LABEL[data.status],
    date: data.createdAt,
    customer: data.customerName ? { name: data.customerName } : null,
    lines: data.items,
    totals: { subtotal: data.subtotal, descuento: 0, tax: data.tax, total: data.total },
    meta: [
      { label: 'Estado', value: STATUS_LABEL[data.status] },
      { label: 'Forma de pago', value: paymentLabel(data.paymentMethod) },
    ],
  };

  return <PrintDocument doc={doc} />;
}
