/** Etiquetas y tonos compartidos por las vistas de Remisiones. */

import type { SalesNoteStatus } from '@/lib/types/erp-ventas';

export const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const DATE = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : DATE.format(d);
}

export const STATUS_LABEL: Record<SalesNoteStatus, string> = {
  abierta: 'Abierta',
  cobrada: 'Cobrada',
  facturada: 'Facturada',
  cancelada: 'Cancelada',
};

/** Tono del Badge por estado (mismos tokens que el resto del panel). */
export function statusTone(status: SalesNoteStatus): 'on' | 'off' | 'blue' | 'ro' {
  switch (status) {
    case 'cobrada':
    case 'facturada':
      return 'on';
    case 'cancelada':
      return 'ro';
    case 'abierta':
    default:
      return 'blue';
  }
}

export const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const PAYMENT_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

export function paymentLabel(method: string | null): string {
  if (!method) return '—';
  return PAYMENT_LABEL[method] ?? method.charAt(0).toUpperCase() + method.slice(1);
}
