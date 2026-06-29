// Helpers de formato que REPLICAN exactamente lo que el frontend Claude Design
// hacía en cliente. La API devuelve strings ya formateados para no tocar la UI.

/** "$12,480" — igual que this.money(n) del frontend. */
export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "12 jun 2026" */
export function dateLong(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getUTCDate()} ${MESES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** "12 jun" (sin año, para listas compactas del dashboard) */
export function dateShort(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getUTCDate()} ${MESES[dt.getUTCMonth()]}`;
}

/** Iniciales para avatares: "Autopartes Salinas" -> "AS" */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Semáforo de inventario (idéntico a la lógica del Panel Cliente). */
export function semaforo(stock: number, min: number): 'agotado' | 'bajo' | 'ok' {
  if (stock === 0) return 'agotado';
  if (stock < min) return 'bajo';
  return 'ok';
}
