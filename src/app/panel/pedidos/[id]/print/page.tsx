'use client';

/**
 * Impresión de pedido (F1 · Tanda B, módulo `ordenes`). Monta <PrintDocument>
 * con los totales guardados del pedido. PanelShell detecta la ruta `/print` y la
 * renderiza sin sidebar; los estilos de hoja viven en print.css (global).
 */

import { getOrder, ORDER_STATUS_LABEL } from '../../../_lib/pedidos';
import { useAsyncData } from '../../../_lib/hooks';
import { useSession } from '../../../_components/session';
import { PrintDocument, type PrintableDoc } from '../../../_components/PrintDocument';
import { Spinner, ErrorState } from '../../../_components/States';

export default function PedidoPrintPage({ params }: { params: { id: string } }) {
  const session = useSession();
  const { data: order, loading, error, reload } = useAsyncData(() => getOrder(params.id));

  if (loading && !order) return <Spinner label="Preparando impresión…" />;
  if (error && !order) return <ErrorState message={error} onRetry={reload} />;
  if (!order) return null;

  const meta: { label: string; value: string }[] = [
    { label: 'Estado', value: ORDER_STATUS_LABEL[order.status] },
  ];
  if (order.channel) meta.push({ label: 'Canal', value: order.channel });

  const doc: PrintableDoc = {
    orgName: session.organization?.name ?? '',
    logoUrl: null,
    docTitle: 'Pedido',
    folio: order.folio,
    status: ORDER_STATUS_LABEL[order.status],
    date: order.createdAt,
    customer: order.customerName ? { name: order.customerName } : null,
    lines: order.items,
    totals: {
      subtotal: order.subtotal,
      descuento: 0,
      tax: order.tax,
      total: order.total,
    },
    meta,
    notes: order.notes,
  };

  return <PrintDocument doc={doc} />;
}
