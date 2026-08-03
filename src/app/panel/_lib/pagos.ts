/**
 * Cliente fetch del módulo PAGOS (F7 · Tanda B). Tablero consolidado de
 * cobros (entra dinero) y pagos (sale dinero), SOLO LECTURA. Wrapper a
 * `/api/erp/payments`. Los tipos del contrato viven aquí (locales al área);
 * NO se tocan tipos compartidos.
 */

import { ApiError } from './api';

const BASE = '/api/erp';

/** Sentido del movimiento: `in` = cobro (entra), `out` = pago (sale). */
export type PaymentDirection = 'in' | 'out';

/** Un movimiento unificado de dinero (cobro o pago). */
export interface PaymentMovement {
  /** Id del renglón de pago en su tabla origen. */
  id: string;
  direction: PaymentDirection;
  /** Fecha del movimiento (ISO, del campo `fecha`). */
  date: string;
  /** Monto en positivo; el signo/color lo decide la UI según `direction`. */
  amount: number;
  formaPago: string;
  /** Contraparte: cliente (cobro) o proveedor (pago). */
  party: string | null;
  /** Folio del documento asociado (factura o compra). */
  docFolio: string | null;
  docType: 'factura' | 'compra';
  /** Sólo cobros: indica si el pago es una REP (complemento de pago). */
  isRep?: boolean;
}

export interface PaymentTotals {
  cobros: number;
  pagos: number;
  neto: number;
}

export interface PaymentsResponse {
  data: PaymentMovement[];
  totals: PaymentTotals;
}

export interface PaymentsParams {
  /** Fecha desde (YYYY-MM-DD), inclusiva. */
  from?: string;
  /** Fecha hasta (YYYY-MM-DD), inclusiva. */
  to?: string;
  /** `in` = sólo cobros, `out` = sólo pagos, `all`/omitido = ambos. */
  direction?: PaymentDirection | 'all';
  formaPago?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
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
  return (await res.json()) as T;
}

function query(p?: PaymentsParams): string {
  const q = new URLSearchParams();
  if (p?.from) q.set('from', p.from);
  if (p?.to) q.set('to', p.to);
  if (p?.direction && p.direction !== 'all') q.set('direction', p.direction);
  if (p?.formaPago) q.set('formaPago', p.formaPago);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Tablero consolidado de cobros y pagos (pagos/ver). */
export const getPayments = (params?: PaymentsParams) =>
  request<PaymentsResponse>(`/payments${query(params)}`);
