/**
 * Cliente fetch de las piezas COMPARTIDAS de Ventas (F1). PROPIEDAD DEL
 * ORQUESTADOR. Cubre solo los endpoints transversales que consumen los 4
 * submódulos y los componentes compartidos (picker de variantes, catálogos de
 * pago, document flow). Cada submódulo agrega su propio cliente para sus
 * endpoints (`_lib/<submodulo>.ts`); esto NO los reemplaza.
 */

import type { VariantPick, VentasCatalogs, DocumentFlow, DocType } from '@/lib/types/erp-ventas';
import { ApiError } from '@/app/panel/_lib/api';

const BASE = '/api/erp';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new ApiError(0, 'No se pudo contactar el servidor');
  }
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const b = (await res.json()) as { error?: string };
      if (b?.error) msg = b.error;
    } catch {
      /* sin JSON */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Busca variantes con precio ya resuelto (lista seleccionada → lista del
 * cliente → base) y stock del almacén indicado (o agregado). Fuente del picker.
 */
export function searchVariants(
  search: string,
  customerId?: string | null,
  opts?: { priceListId?: string | null; warehouseId?: string | null },
) {
  const q = new URLSearchParams();
  if (search) q.set('search', search);
  if (customerId) q.set('customerId', customerId);
  if (opts?.priceListId) q.set('priceListId', opts.priceListId);
  if (opts?.warehouseId) q.set('warehouseId', opts.warehouseId);
  return req<{ data: VariantPick[] }>(`/variants?${q.toString()}`).then((r) => r.data);
}

/** Catálogos SAT de pago (forma/método) para los selects de facturación. */
export function getVentasCatalogs() {
  return req<VentasCatalogs>('/catalogs/ventas');
}

/** Cadena documental navegable en ambos sentidos de un documento. */
export function getDocumentFlow(type: DocType, id: string) {
  const q = new URLSearchParams({ type, id });
  return req<DocumentFlow>(`/document-flow?${q.toString()}`);
}

// ===== Conversiones entre documentos (enlace cotización→pedido→factura) =====

/** Convierte una cotización aceptada en pedido (liga por document_links). */
export function convertQuoteToOrder(quoteId: string) {
  return req<{ ok: boolean; orderId: string }>('/conversions/quote-to-order', {
    method: 'POST',
    body: JSON.stringify({ quoteId }),
  });
}

/** Convierte un pedido en factura (borrador). */
export function convertOrderToInvoice(
  orderId: string,
  opts?: { metodoPago?: 'PUE' | 'PPD'; formaPago?: string; serie?: string },
) {
  return req<{ ok: boolean; invoiceId: string }>('/conversions/order-to-invoice', {
    method: 'POST',
    body: JSON.stringify({ orderId, ...opts }),
  });
}
