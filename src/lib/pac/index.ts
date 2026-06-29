import type { PacProvider } from './types';
import { StubPacProvider } from './stub';
import { env } from '@/lib/env';

export * from './types';

/**
 * Devuelve el PacProvider activo según APLIKA_PAC_PROVIDER.
 * Hoy solo 'stub'. Para integrar un PAC real, crea la clase (FacturamaPac, etc.)
 * implementando PacProvider y añádela al switch — el resto del sistema no cambia.
 */
export function getPacProvider(): PacProvider {
  switch (env.pacProvider()) {
    case 'stub':
    default:
      // Los proveedores reales (facturama|finkok|sw) se enchufan aquí cuando
      // se definan sus credenciales. Mientras tanto, stub mockeable.
      return new StubPacProvider();
  }
}
