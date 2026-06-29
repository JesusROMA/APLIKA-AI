// Lógica pura del pipeline de pedidos (espejo de transition_order en SQL).
// Se mantiene en JS para validar en cliente y para tests deterministas.

export const PIPELINE = ['borrador', 'confirmado', 'pagado', 'surtido', 'facturado', 'enviado'] as const;
export type OrderStatus = (typeof PIPELINE)[number] | 'cancelada';

/** ¿Se permite avanzar de `from` a `to`? (No se retrocede; cancelar salvo final.) */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === 'cancelada') return false;
  if (to === 'cancelada') return from !== 'facturado' && from !== 'enviado';
  const i = PIPELINE.indexOf(from as any);
  const j = PIPELINE.indexOf(to as any);
  if (i < 0 || j < 0) return false;
  return j >= i;
}

/** ¿La transición a `to` debe aplicar el decremento de inventario? */
export function appliesStock(to: OrderStatus): boolean {
  return ['pagado', 'surtido', 'facturado', 'enviado'].includes(to);
}
