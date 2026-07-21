import type { QuoteStatus } from '@/lib/types/erp-ventas';

/** Etiqueta legible del estado de una cotización. */
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
};

/** Tono del Badge según el estado (misma heurística que DocumentFlow). */
export function quoteTone(status: QuoteStatus): 'on' | 'off' | 'blue' | 'ro' {
  switch (status) {
    case 'aceptada':
      return 'on';
    case 'rechazada':
    case 'vencida':
      return 'ro';
    case 'borrador':
      return 'off';
    default:
      return 'blue';
  }
}
