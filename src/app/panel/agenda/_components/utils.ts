/** Utilidades de fecha/hora locales para la agenda (semana lunes→domingo). */

/** Lunes 00:00 (local) de la semana que contiene `d`. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const diff = (x.getDay() + 6) % 7; // días transcurridos desde el lunes
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Fecha local como 'YYYY-MM-DD' (para inputs type=date y agrupado por día). */
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 'HH:MM' local desde un ISO. */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Combina 'YYYY-MM-DD' + 'HH:MM' locales en un ISO (timestamptz). */
export function combineToISO(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/** Minutos entre dos ISO (redondeado). */
export function diffMinutes(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

export const DAY_FMT = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});

export const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
