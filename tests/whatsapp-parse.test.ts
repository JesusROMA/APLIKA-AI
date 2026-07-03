import { describe, it, expect } from 'vitest';
import { parseBookingMessage } from '@/lib/appointments/whatsapp';

// Referencia fija: miércoles 1 de julio de 2026, 10:00 local.
const NOW = new Date(2026, 6, 1, 10, 0, 0);

function local(y: number, m: number, d: number, h: number, min = 0) {
  return new Date(y, m, d, h, min, 0, 0).toISOString();
}

describe('parseBookingMessage', () => {
  it('interpreta "mañana a las 4 de la tarde" como día siguiente 16:00', () => {
    const r = parseBookingMessage('quiero cita mañana a las 4 de la tarde', NOW);
    expect(r.confident).toBe(true);
    expect(r.startsAt).toBe(local(2026, 6, 2, 16, 0));
  });

  it('interpreta "hoy a las 9am" como hoy 09:00', () => {
    const r = parseBookingMessage('¿me agendas hoy a las 9am?', NOW);
    expect(r.startsAt).toBe(local(2026, 6, 1, 9, 0));
  });

  it('interpreta hora 24h "16:30"', () => {
    const r = parseBookingMessage('el viernes 16:30 por favor', NOW);
    // viernes siguiente = 3 de julio
    expect(r.startsAt).toBe(local(2026, 6, 3, 16, 30));
  });

  it('interpreta "el día 15 a las 10:30"', () => {
    const r = parseBookingMessage('una cita para el día 15 a las 10:30', NOW);
    expect(r.startsAt).toBe(local(2026, 6, 15, 10, 30));
  });

  it('interpreta "15 de agosto a las 5pm"', () => {
    const r = parseBookingMessage('agéndame el 15 de agosto a las 5pm', NOW);
    expect(r.startsAt).toBe(local(2026, 7, 15, 17, 0));
  });

  it('hora sin marcador entre 1 y 7 se asume de la tarde', () => {
    const r = parseBookingMessage('mañana a las 4', NOW);
    expect(r.startsAt).toBe(local(2026, 6, 2, 16, 0));
  });

  it('sin hora no es confiable pero detecta la fecha', () => {
    const r = parseBookingMessage('quiero una cita mañana', NOW);
    expect(r.confident).toBe(false);
    expect(r.startsAt).toBeNull();
    expect(r.dateText).toBe('mañana');
  });
});
