// ============================================================================
// Aplika.ai — Parser de mensajes de WhatsApp para reserva de citas.
// Extrae fecha y hora de un texto en español coloquial (mensaje del paciente)
// y devuelve el ISO de inicio propuesto. Se usa en el endpoint
// POST /api/appointments/whatsapp; el Panel Cliente replica esta lógica en JS
// para el modo demo (sin backend).
// ============================================================================

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2,
  miercoles: 3, 'miércoles': 3, jueves: 4, viernes: 5,
  sabado: 6, 'sábado': 6,
};

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11,
};

export interface ParsedBooking {
  /** ISO del inicio propuesto, o null si no se pudo inferir fecha+hora. */
  startsAt: string | null;
  /** Texto de la fecha detectada (para mostrar al operador). */
  dateText: string | null;
  /** Texto de la hora detectada. */
  timeText: string | null;
  /** true cuando se detectaron fecha y hora con confianza. */
  confident: boolean;
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Franja horaria (mañana/tarde/noche) para desambiguar horas de 1 a 12.
function periodOffset(text: string, hour: number): number {
  if (/\b(pm|p\.m\.|de la tarde|por la tarde|de la noche|por la noche)\b/.test(text) && hour < 12) return 12;
  if (/\b(am|a\.m\.|de la mañana|por la mañana|en la mañana)\b/.test(text)) return 0;
  // Sin marcador explícito: horas 1–7 se asumen de la tarde (consultorio típico).
  if (hour >= 1 && hour <= 7) return 12;
  return 0;
}

/** Detecta la hora (24h). Devuelve {hour, minute, timeText} o null. */
function parseTime(raw: string): { hour: number; minute: number; timeText: string } | null {
  const text = raw.toLowerCase();
  if (/\bmediod[ií]a\b/.test(text)) return { hour: 12, minute: 0, timeText: 'mediodía' };

  // hh:mm  (16:00, 4:30, 9.30)
  const hm = text.match(/\b([0-2]?\d)[:.]([0-5]\d)\b/);
  if (hm) {
    let h = parseInt(hm[1], 10);
    const m = parseInt(hm[2], 10);
    if (h <= 12) h += periodOffset(text, h);
    if (h >= 0 && h <= 23) return { hour: h, minute: m, timeText: `${String(h).padStart(2, '0')}:${hm[2]}` };
  }

  // "a las 4", "4 pm", "4pm", "a las 10 am"
  const h12 = text.match(/(?:a\s+las?\s+)?\b([1-9]|1[0-2])\s*(am|pm|a\.m\.|p\.m\.|de la (?:mañana|tarde|noche)|hrs?|horas?)?\b/);
  if (h12) {
    let h = parseInt(h12[1], 10);
    const marker = h12[2] ? ' ' + h12[2] : '';
    h += periodOffset(text, h);
    return { hour: h, minute: 0, timeText: `${h12[1]}${marker}`.trim() };
  }
  return null;
}

/** Detecta la fecha respecto a `now`. Devuelve {date, dateText} o null. */
function parseDate(raw: string, now: Date): { date: Date; dateText: string } | null {
  const text = stripAccents(raw.toLowerCase());
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = (d: Date, label: string) => ({ date: d, dateText: label });

  if (/\bpasado\s+manana\b/.test(text)) { const d = new Date(base); d.setDate(d.getDate() + 2); return at(d, 'pasado mañana'); }
  if (/\bhoy\b/.test(text)) return at(new Date(base), 'hoy');
  // "mañana" como día (evita "de/por/en la mañana", que es franja horaria)
  if (/(^|[^a-z])manana\b/.test(text) && !/(de|por|en)\s+la\s+manana/.test(text)) {
    const d = new Date(base); d.setDate(d.getDate() + 1); return at(d, 'mañana');
  }

  // "15 de julio" / "5 de agosto"
  const dm = text.match(/\b([0-3]?\d)\s+de\s+([a-z]+)\b/);
  if (dm && MONTHS[dm[2]] !== undefined) {
    const day = parseInt(dm[1], 10);
    let year = now.getFullYear();
    const month = MONTHS[dm[2]];
    if (month < now.getMonth() || (month === now.getMonth() && day < now.getDate())) year += 1;
    const d = new Date(year, month, day);
    return at(d, `${day} de ${dm[2]}`);
  }

  // dd/mm o dd-mm
  const slash = text.match(/\b([0-3]?\d)[\/\-]([01]?\d)(?:[\/\-](\d{2,4}))?\b/);
  if (slash) {
    const day = parseInt(slash[1], 10);
    const month = parseInt(slash[2], 10) - 1;
    let year = slash[3] ? parseInt(slash[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(year, month, day);
      return at(d, `${slash[1]}/${slash[2]}`);
    }
  }

  // Día de la semana ("el lunes", "este viernes") — próxima ocurrencia (>= mañana).
  for (const name in WEEKDAYS) {
    const key = stripAccents(name);
    if (new RegExp(`\\b${key}\\b`).test(text)) {
      const target = WEEKDAYS[name];
      const d = new Date(base);
      let delta = (target - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // "el lunes" siendo lunes = el próximo
      d.setDate(d.getDate() + delta);
      return at(d, name);
    }
  }

  // "el 15" / "el día 20" (día del mes actual, o del siguiente si ya pasó)
  const dom = text.match(/\bel\s+(?:dia\s+)?([0-3]?\d)\b/);
  if (dom) {
    const day = parseInt(dom[1], 10);
    if (day >= 1 && day <= 31) {
      let month = now.getMonth();
      let year = now.getFullYear();
      if (day < now.getDate()) { month += 1; if (month > 11) { month = 0; year += 1; } }
      const d = new Date(year, month, day);
      return at(d, `día ${day}`);
    }
  }

  return null;
}

/**
 * Interpreta un mensaje de WhatsApp y propone el inicio de la cita.
 * `now` permite pruebas deterministas.
 */
export function parseBookingMessage(message: string, now: Date = new Date()): ParsedBooking {
  const dateHit = parseDate(message, now);
  const timeHit = parseTime(message);

  if (dateHit && timeHit) {
    const d = new Date(dateHit.date);
    d.setHours(timeHit.hour, timeHit.minute, 0, 0);
    return { startsAt: d.toISOString(), dateText: dateHit.dateText, timeText: timeHit.timeText, confident: true };
  }
  return {
    startsAt: null,
    dateText: dateHit?.dateText ?? null,
    timeText: timeHit?.timeText ?? null,
    confident: false,
  };
}
