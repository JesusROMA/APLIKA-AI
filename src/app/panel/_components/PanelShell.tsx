'use client';

/**
 * Shell del panel ERP. Client Component porque el nav se construye desde
 * GET /api/erp/me (fetch same-origin con cookies) y hay interacción (drawer
 * móvil, banner de impersonación). Provee SessionProvider a todo el árbol.
 *
 * Contrato de sesión:
 *  - 200 → SessionInfo: render normal.
 *  - 401 → sin sesión: estado "inicia sesión" con link a /dc/Login.dc.html.
 *  - otro error → estado de error con reintento (degradación en runtime aunque
 *    el backend aún no exista; el build no depende de ello).
 */

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { SessionInfo } from '@/lib/types/erp';
import { getMe, ApiError } from '../_lib/api';
import { SessionProvider } from './session';
import { Sidebar, SidebarBrand } from './Sidebar';
import { Spinner } from './States';

const TITLES: Record<string, string> = {
  '/panel': 'Inicio',
  '/panel/clientes': 'Clientes',
  '/panel/productos': 'Productos',
  '/panel/almacenes': 'Almacenes',
  '/panel/listas-precios': 'Listas de precios',
  '/panel/cotizaciones': 'Cotizaciones',
  '/panel/pedidos': 'Pedidos',
  '/panel/facturacion': 'Facturación',
  '/panel/inventario': 'Inventario',
  '/panel/agenda': 'Agenda',
  '/panel/expediente': 'Expediente clínico',
  '/panel/config': 'Configuración',
  '/panel/auditoria': 'Bitácora',
  '/panel/compras': 'Compras',
  '/panel/crm': 'CRM Clientes',
  '/panel/pagos': 'Pagos',
};

function titleFromPath(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const match = Object.keys(TITLES).find((k) => k !== '/panel' && pathname.startsWith(k));
  return match ? TITLES[match] : 'Panel';
}

export function PanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'anon' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string>('');
  const [navOpen, setNavOpen] = useState(false);

  const load = useCallback(() => {
    setStatus('loading');
    getMe()
      .then((s) => {
        setSession(s);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          setStatus('anon');
        } else {
          setErrMsg(e instanceof Error ? e.message : 'Error desconocido');
          setStatus('error');
        }
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Cierra el drawer móvil al cambiar de ruta.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (status === 'loading') {
    return (
      <div className="panel-root">
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <Spinner label="Cargando panel…" />
        </div>
      </div>
    );
  }

  if (status === 'anon') {
    return (
      <div className="panel-root">
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <div className="panel-card" style={{ padding: 'var(--sp-6)', textAlign: 'center', maxWidth: 420 }}>
            <h1 className="panel-page-title" style={{ marginBottom: 'var(--sp-1)' }}>
              Inicia sesión
            </h1>
            <p className="panel-page-sub" style={{ marginBottom: 'var(--sp-3)' }}>
              Necesitas una sesión activa para entrar al panel.
            </p>
            <a className="pbtn pbtn--primary" href="/dc/Login.dc.html">
              Ir a iniciar sesión
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error' || !session) {
    return (
      <div className="panel-root">
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <div className="panel-card" style={{ padding: 'var(--sp-6)', textAlign: 'center', maxWidth: 420 }}>
            <h1 className="panel-page-title" style={{ marginBottom: 'var(--sp-1)' }}>
              No se pudo cargar el panel
            </h1>
            <p className="panel-page-sub" style={{ marginBottom: 'var(--sp-3)' }}>
              {errMsg || 'Revisa tu conexión e inténtalo de nuevo.'}
            </p>
            <button type="button" className="pbtn pbtn--primary" onClick={load}>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Rutas de impresión (/panel/**/print): sin sidebar ni topbar, solo el lienzo
  // imprimible, pero conservando el contexto de sesión (branding del tenant).
  if (pathname?.endsWith('/print')) {
    return (
      <SessionProvider value={session}>
        <div className="print-root">{children}</div>
      </SessionProvider>
    );
  }

  return (
    <SessionProvider value={session}>
      <div className="panel-root">
        <div className="panel-shell">
          <aside className="panel-sidebar" data-open={navOpen}>
            <SidebarBrand />
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </aside>
          {navOpen && (
            <div
              className="panel-nav-scrim"
              onClick={() => setNavOpen(false)}
              aria-hidden="true"
            />
          )}

          <div className="panel-main">
            {session.impersonating && <ImpersonationBanner session={session} />}
            <header className="panel-topbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="panel-burger"
                  aria-label="Abrir menú"
                  aria-expanded={navOpen}
                  onClick={() => setNavOpen((v) => !v)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
                <h1 className="panel-topbar-title">{titleFromPath(pathname)}</h1>
              </div>
              <div className="panel-user">
                <span>{session.fullName ?? session.email}</span>
                <span className="panel-avatar" aria-hidden="true">
                  {(session.fullName ?? session.email ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
            </header>

            <main className="panel-content">{children}</main>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
}

function ImpersonationBanner({ session }: { session: SessionInfo }) {
  const [leaving, setLeaving] = useState(false);
  const org = session.impersonating!;

  const stop = async () => {
    setLeaving(true);
    try {
      await fetch(`/api/admin/tenants/${org.id}/impersonate`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
    } catch {
      /* aunque falle, recargamos para reflejar el estado real */
    }
    window.location.reload();
  };

  return (
    <div className="panel-impersonation" role="status">
      <span>
        Viendo como <strong>{org.name}</strong>
      </span>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={stop} disabled={leaving}>
        {leaving ? 'Saliendo…' : 'Salir'}
      </button>
    </div>
  );
}
