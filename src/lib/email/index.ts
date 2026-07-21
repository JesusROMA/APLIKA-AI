import type { EmailProvider } from './types';
import { MockEmailProvider } from './mock';
import { env } from '@/lib/env';

export * from './types';

/**
 * Devuelve el EmailProvider activo según APLIKA_EMAIL_PROVIDER (default 'mock').
 * Para conectar un proveedor real (Resend, SES...), crea la clase implementando
 * EmailProvider y añádela al switch — el resto del sistema no cambia.
 */
export function getEmailProvider(): EmailProvider {
  switch (env.emailProvider()) {
    case 'mock':
    default:
      return new MockEmailProvider();
  }
}
