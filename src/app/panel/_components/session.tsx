'use client';

/**
 * Contexto de sesión del panel (AGENTE-UI).
 *
 * Provee el SessionInfo (de GET /api/erp/me) a todo el árbol y un helper `can()`
 * para las GUARDAS DE UI por permiso. IMPORTANTE: esto es sólo UX — el servidor
 * es la autoridad de seguridad (RLS + guards). No reimplementamos seguridad aquí:
 * únicamente ocultamos/deshabilitamos acciones que el server igualmente negaría.
 */

import { createContext, useContext } from 'react';
import type { SessionInfo, ModuleKey, PermAction } from '@/lib/types/erp';

const SessionContext = createContext<SessionInfo | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionInfo;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionInfo {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession debe usarse dentro de <SessionProvider>');
  }
  return ctx;
}

/** True si la sesión tiene permiso para (módulo, acción). Sólo UX. */
export function useCan(): (module: ModuleKey, action: PermAction) => boolean {
  const session = useSession();
  return (module: ModuleKey, action: PermAction) => Boolean(session.perms?.[module]?.[action]);
}
