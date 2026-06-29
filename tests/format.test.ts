import { describe, it, expect } from 'vitest';
import { money, dateLong, initials, semaforo } from '@/lib/format';

describe('format helpers (paridad con el frontend)', () => {
  it('money redondea y agrupa con coma', () => {
    expect(money(12480)).toBe('$12,480');
    expect(money(284500.4)).toBe('$284,500');
    expect(money(0)).toBe('$0');
  });

  it('dateLong en formato "12 jun 2026"', () => {
    expect(dateLong('2026-06-12T00:00:00Z')).toBe('12 jun 2026');
  });

  it('initials toma dos palabras', () => {
    expect(initials('Autopartes Salinas')).toBe('AS');
    expect(initials('Refaccionaria del Norte')).toBe('RD');
  });

  it('semáforo de inventario', () => {
    expect(semaforo(0, 20)).toBe('agotado');
    expect(semaforo(6, 20)).toBe('bajo');
    expect(semaforo(50, 20)).toBe('ok');
  });
});
