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

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
              <UserMenu session={session} />
            </header>

            <main className="panel-content">{children}</main>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
}

/**
 * Menú del usuario (topbar): Panel admin (solo super_admin), Configuración y
 * Cerrar sesión. Réplica del desplegable del panel anterior, sobre la sesión
 * multitenant nueva. Cierra con click-fuera y Escape.
 */
function UserMenu({ session }: { session: SessionInfo }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const logout = async () => {
    setLeaving(true);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      const body = (await res.json().catch(() => null)) as { redirect?: string } | null;
      window.location.href = body?.redirect ?? '/dc/Login.dc.html';
    } catch {
      window.location.href = '/dc/Login.dc.html';
    }
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 13.5,
    fontWeight: 600,
    color: 'inherit',
    padding: '9px 12px',
    borderRadius: 8,
    textDecoration: 'none',
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="panel-user"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit' }}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{session.fullName ?? session.email}</span>
        <span className="panel-avatar" aria-hidden="true">
          {(session.fullName ?? session.email ?? '?').charAt(0).toUpperCase()}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="panel-card"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            minWidth: 210,
            padding: 6,
            zIndex: 40,
            boxShadow: '0 18px 44px -18px rgba(2,18,38,0.35)',
          }}
        >
          <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border, #E6F1FB)' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{session.fullName ?? session.email}</div>
            <div style={{ fontSize: 12, opacity: 0.65 }}>{session.email}</div>
          </div>
          {session.role === 'super_admin' && (
            <a role="menuitem" href="/dc/Panel Super-admin.dc.html" style={itemStyle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.5 19 5V11C19 16 15.8 19.4 12 21.5C8.2 19.4 5 16 5 11V5Z" /></svg>
              Panel admin
            </a>
          )}
          <Link role="menuitem" href="/panel/config" style={itemStyle} onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /><path d="M19.4 13a7.5 7.5 0 0 0 .1-1 7.5 7.5 0 0 0-.1-1l1.9-1.4-1.9-3.3-2.2.9a7 7 0 0 0-1.7-1L15 3h-4l-.4 2.2a7 7 0 0 0-1.7 1l-2.2-.9-1.9 3.3L6.7 10a7.5 7.5 0 0 0 0 2l-1.9 1.4 1.9 3.3 2.2-.9a7 7 0 0 0 1.7 1L11 21h4l.4-2.2a7 7 0 0 0 1.7-1l2.2.9 1.9-3.3Z" /></svg>
            Configuración
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={logout}
            disabled={leaving}
            style={{ ...itemStyle, color: 'var(--error, #D24545)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            {leaving ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </div>
      )}
    </div>
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
