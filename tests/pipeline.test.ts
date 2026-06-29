import { describe, it, expect } from 'vitest';
import { canTransition, appliesStock } from '@/lib/modules/pipeline';

describe('pipeline de pedidos', () => {
  it('avanza en orden y no retrocede', () => {
    expect(canTransition('borrador', 'confirmado')).toBe(true);
    expect(canTransition('confirmado', 'pagado')).toBe(true);
    expect(canTransition('pagado', 'confirmado')).toBe(false); // retroceso
    expect(canTransition('borrador', 'enviado')).toBe(true); // saltos hacia adelante ok
  });

  it('cancela solo antes de facturar/enviar', () => {
    expect(canTransition('borrador', 'cancelada')).toBe(true);
    expect(canTransition('pagado', 'cancelada')).toBe(true);
    expect(canTransition('facturado', 'cancelada')).toBe(false);
    expect(canTransition('enviado', 'cancelada')).toBe(false);
  });

  it('no permite transiciones desde cancelada', () => {
    expect(canTransition('cancelada', 'confirmado')).toBe(false);
  });

  it('aplica stock a partir de pagado', () => {
    expect(appliesStock('confirmado')).toBe(false);
    expect(appliesStock('pagado')).toBe(true);
    expect(appliesStock('surtido')).toBe(true);
  });
});
