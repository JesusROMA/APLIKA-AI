'use client';

/**
 * Drawer de "Cliente 360": saldo por cobrar + historial de documentos
 * (cotizaciones, pedidos, facturas) con enlace a cada uno. Lee
 * GET /api/erp/crm/customers/{id}/history.
 */

import Link from 'next/link';
import type { CustomerRow } from '@/lib/types/erp';
import type { CustomerHistoryDoc } from '@/lib/types/erp-crm';
import { getCustomerHistory } from '../../_lib/crm';
import { useAsyncData } from '../../_lib/hooks';
import { Drawer } from '../../_components/Drawer';
import { Badge, ErrorState, LoadingState, EmptyState } from '../../_components/States';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DATE = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

const DOC_LABEL: Record<CustomerHistoryDoc['type'], string> = {
  cotizacion: 'Cotización',
  pedido: 'Pedido',
  factura: 'Factura',
};

function docHref(doc: CustomerHistoryDoc): string {
  switch (doc.type) {
    case 'cotizacion':
      return `/panel/cotizaciones/${doc.id}`;
    case 'pedido':
      return `/panel/pedidos/${doc.id}`;
    case 'factura':
      return `/panel/facturacion/${doc.id}`;
  }
}

export function CustomerHistoryDrawer({
  customer,
  onClose,
}: {
  customer: CustomerRow;
  onClose: () => void;
}) {
  const history = useAsyncData(() => getCustomerHistory(customer.id));

  return (
    <Drawer open title={customer.name} onClose={onClose}>
      <div className="panel-field">
        <span className="panel-field-label">Saldo por cobrar (CxC)</span>
        <strong style={{ fontSize: '1.4rem', fontVariantNumeric: 'tabular-nums' }}>
          {history.data ? MXN.format(history.data.balance) : '—'}
        </strong>
      </div>

      <div style={{ marginTop: 'var(--sp-3)' }}>
        <p className="panel-field-label" style={{ marginBottom: 'var(--sp-1)' }}>
          Documentos
        </p>

        {history.loading ? (
          <LoadingState label="Cargando historial…" />
        ) : history.error ? (
          <ErrorState message={history.error} onRetry={history.reload} />
        ) : (history.data?.docs.length ?? 0) === 0 ? (
          <EmptyState
            title="Sin documentos"
            message="Este cliente aún no tiene cotizaciones, pedidos ni facturas."
          />
        ) : (
          <div className="panel-table-wrap">
            <table className="panel-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Folio</th>
                  <th>Estado</th>
                  <th className="panel-table-num">Total</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {history.data!.docs.map((d) => (
                  <tr key={`${d.type}-${d.id}`}>
                    <td>{DOC_LABEL[d.type]}</td>
                    <td>
                      <Link
                        href={docHref(d)}
                        style={{ color: 'var(--blue)', textDecoration: 'underline' }}
                      >
                        {d.folio}
                      </Link>
                    </td>
                    <td>
                      <Badge tone="blue">{d.status}</Badge>
                    </td>
                    <td className="panel-table-num">{MXN.format(d.total)}</td>
                    <td>{DATE.format(new Date(d.date))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Drawer>
  );
}
