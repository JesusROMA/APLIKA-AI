import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '@/lib/env';

/**
 * Impersonación de super_admin (C1.3). La cookie httpOnly firmada
 * `aplika_impersonate=<org_id>.<sig>` transporta el tenant que un super_admin
 * está operando. El backend la verifica, y `createSupabaseServerClient` agrega
 * el header `x-aplika-impersonate` para que la RLS (app.current_org_id v2) la
 * respete SOLO cuando la sesión es super_admin.
 */
export const IMPERSONATE_COOKIE = 'aplika_impersonate';

/** Vigencia de la sesión de impersonación (8 h). */
export const IMPERSONATE_MAX_AGE = 60 * 60 * 8;

/**
 * Secreto de firma. Reusa la service-role key (secreto de servidor ya presente
 * en modo real) para no introducir una variable de entorno nueva. La cookie
 * solo autoriza el header; la autoridad real sigue siendo la RLS (que ignora el
 * header si el JWT no es super_admin).
 */
function signingSecret(): string {
  return env.supabaseServiceRole();
}

function sign(orgId: string): string {
  return createHmac('sha256', signingSecret()).update(orgId).digest('base64url');
}

/** Devuelve el valor firmado `<org_id>.<sig>` para setear en la cookie. */
export function signImpersonation(orgId: string): string {
  return `${orgId}.${sign(orgId)}`;
}

/** Verifica el valor firmado; devuelve el org_id o null si es inválido. */
export function verifyImpersonation(value: string | undefined | null): string | null {
  if (!value) return null;
  const idx = value.lastIndexOf('.');
  if (idx <= 0) return null;
  const orgId = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = sign(orgId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return orgId;
}

/** Lee y verifica la cookie de impersonación de la request actual. */
export function readImpersonationCookie(): string | null {
  return verifyImpersonation(cookies().get(IMPERSONATE_COOKIE)?.value);
}
