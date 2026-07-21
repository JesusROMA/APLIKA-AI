/**
 * Validaciones de cliente que ESPEJAN las del servidor (contrato C1.6). Son
 * sólo UX — el server valida de nuevo y es la autoridad (rechaza 422). No
 * confiamos en estas reglas para seguridad; sólo para feedback inmediato.
 */

// RFC: 3-4 letras (persona moral/física) + 6 dígitos fecha + 3 homoclave.
const RFC_RE = /^([A-ZÑ&]{3,4})[0-9]{6}[A-Z0-9]{3}$/i;
// CP: 5 dígitos.
const CP_RE = /^[0-9]{5}$/;

/** Devuelve mensaje de error o null. Vacío es válido (campo opcional). */
export function validateRfc(v: string): string | null {
  const s = v.trim().toUpperCase();
  if (!s) return null;
  return RFC_RE.test(s) ? null : 'RFC inválido (formato SAT: 12-13 caracteres).';
}

export function validateCp(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  return CP_RE.test(s) ? null : 'CP inválido (5 dígitos).';
}

export function isBlank(v: string): boolean {
  return v.trim().length === 0;
}
