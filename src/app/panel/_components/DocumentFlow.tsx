'use client';

/**
 * DocumentFlow — cadena documental navegable (cotización→pedido→remisión→
 * factura). Pieza compartida F1: cualquier submódulo la monta con su
 * {type, id}. Los nodos que no son el actual enlazan a su ruta de panel.
 */

import Link from 'next/link';
import type { DocType, DocFlowNode } from '@/lib/types/erp-ventas';
import { getDocumentFlow } from '../_lib/ventas-api';
import { useAsyncData } from '../_lib/hooks';
import { Badge, ErrorState, Spinner } from './States';

interface Props {
  type: DocType;
  id: string;
  currentLabel?: string;
}

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Ruta de panel de cada tipo de documento. */
const ROUTE: Record<DocType, string> = {
  quote: '/panel/cotizaciones',
  order: '/panel/pedidos',
  invoice: '/panel/facturacion',
};

/** Tono del badge según el estado del documento (heurística compartida). */
function statusTone(status: string): 'on' | 'off' | 'blue' | 'ro' {
  const s = status.toLowerCase();
  if (['cancelada', 'cancelado', 'rechazada', 'vencida'].includes(s)) return 'ro';
  if (
    ['aceptada', 'pagada', 'pagado', 'cobrada', 'timbrada', 'surtido', 'facturada', 'facturado', 'enviado'].includes(s)
  ) {
    return 'on';
  }
  if (['borrador'].includes(s)) return 'off';
  return 'blue';
}

export function DocumentFlow({ type, id, currentLabel }: Props) {
  const { data, loading, error, reload } = useAsyncData(() => getDocumentFlow(type, id));

  if (loading) return <Spinner label="Cargando cadena documental…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const nodes: DocFlowNode[] = data?.nodes ?? [];

  if (nodes.length <= 1) {
    return <p className="f1-flow-empty">Sin documentos relacionados.</p>;
  }

  return (
    <nav className="f1-flow" aria-label="Cadena documental">
      {nodes.map((node, i) => {
        const isCurrent = node.type === type && node.id === id;
        const content = (
          <>
            <span className="f1-flow-folio">{isCurrent && currentLabel ? currentLabel : node.folio}</span>
            <Badge tone={statusTone(node.status)}>{node.status}</Badge>
            <span className="f1-flow-total">{MXN.format(node.total)}</span>
          </>
        );
        return (
          <div className="f1-flow-item" key={`${node.type}:${node.id}`}>
            {isCurrent ? (
              <span className="f1-flow-node f1-flow-node--current" aria-current="page">
                {content}
              </span>
            ) : (
              <Link className="f1-flow-node" href={`${ROUTE[node.type]}/${node.id}`}>
                {content}
              </Link>
            )}
            {i < nodes.length - 1 && (
              <span className="f1-flow-arrow" aria-hidden="true">
                →
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
