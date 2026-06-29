// Rate limiter simple en memoria (ventana deslizante por clave).
// Suficiente para 1 instancia en el VPS. Para multi-instancia, mover a Redis.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false; // bloqueado
  }
  arr.push(now);
  hits.set(key, arr);
  return true; // permitido
}

export function clientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
