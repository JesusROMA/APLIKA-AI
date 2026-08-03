'use client';

/**
 * Vista imprimible de la factura. Sin sidebar (PanelShell detecta /print) y con
 * el branding del tenant desde la sesión. Monta el componente compartido
 * PrintDocument.
 */

import { useParams } from 'next/navigation';
import { getInvoice } from '../../../_lib/facturacion';
import { useAsyncData } from '../../../_lib/hooks';
import { useSession } from '../../../_components/session';
import { PrintDocument, type PrintableDoc } from '../../../_components/PrintDocument';
import { Spinner, ErrorState } from '../../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const STATUS_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  timbrada: 'Timbrada',
  pagada: 'Pagada',
  pago_parcial: 'Pago parcial',
  cancelada: 'Cancelada',
};

export default function FacturaPrintPage() {
  const params = useParams<{ id: string }>();
  const session = useSession();
  const detail = useAsyncData(() => getInvoice(params.id));

  if (detail.loading) return <Spinner label="Preparando impresión…" />;
  if (detail.error || !detail.data) {
    return <ErrorState message={detail.error ?? 'No se encontró la factura.'} onRetry={detail.reload} />;
  }

  const inv = detail.data;
  const meta: { label: string; value: string }[] = [
    { label: 'UUID', value: inv.uuid ?? '—' },
    { label: 'Método de pago', value: inv.metodoPago },
    { label: 'Forma de pago', value: inv.formaPago ?? '—' },
  ];
  if (inv.saldo !== null) meta.push({ label: 'Saldo', value: MXN.format(inv.saldo) });

  const doc: PrintableDoc = {
    orgName: session.organization?.name ?? '',
    brandColor: session.organization?.brandColor ?? undefined,
    logoUrl: session.organization?.logoUrl ?? undefined,
    docTitle: 'Factura',
    folio: inv.folio,
    status: STATUS_LABEL[inv.status] ?? inv.status,
    date: inv.createdAt,
    customer: inv.customerName ? { name: inv.customerName } : null,
    lines: inv.items,
    totals: { subtotal: inv.subtotal, descuento: 0, tax: inv.tax, total: inv.total },
    meta,
  };

  return <PrintDocument doc={doc} />;
}
