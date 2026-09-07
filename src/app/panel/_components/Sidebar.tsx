'use client';

/**
 * Nav lateral del panel, organizada por SECTORES (Operación / Finanzas /
 * Administración) con grupos plegables (Ventas / Compras / Inventario).
 * Cada entrada se muestra según los módulos activos del tenant (session.modules)
 * y los permisos (perms.*.ver). Los módulos core (dashboard/config) se dibujan
 * como fijos. Los maestros (0026) se abren desde Configuración → Maestros,
 * cada uno gated por su módulo `maestro_*`.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ModuleKey } from '@/lib/types/erp';
import { useSession } from './session';
import { Icon } from './Icon';

// Paths `d` de iconos (lienzo 24x24, stroke).
const IC = {
  inicio: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  clientes: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  proveedores: 'M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  productos: 'M20 7 12 3 4 7l8 4 8-4Zm0 0v10l-8 4-8-4V7',
  almacenes: 'M3 21V9l9-5 9 5v12M9 21v-6h6v6',
  listas: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  ventas: 'M6 7h12l-1 13H7zM9 7V5a3 3 0 0 1 6 0v2',
  compras: 'M3 3h2l2.4 12.3a1 1 0 0 0 1 .7h9.2a1 1 0 0 0 1-.8L21 8H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  inventario: 'M12 3 3 7l9 4 9-4zM3 7v10l9 4 9-4V7M12 11v10',
  entrada: 'M12 3v10m0 0 4-4m-4 4-4-4M4 15v5h16v-5',
  doc: 'M7 3h8l3 3v15H7V3zM9 9h6M9 12h6M9 15h4',
  agenda: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4',
  expediente: 'M7 3h8l3 3v15H7V3zM9 8h.01M12 8h3M9 12h6M9 16h4',
  facturacion: 'M7 3h8l3 3v15l-2-1-2 1-2-1-2 1-2-1-2 1V3zM9 9h6M9 12h6M9 15h4',
  finanzas: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  config: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM4 12a8 8 0 0 1 .2-1.8L2 8.6l2-3.4 2.2 1a8 8 0 0 1 3-1.7L12 2h0l.8 2.5a8 8 0 0 1 3 1.7l2.2-1 2 3.4-2.2 1.6A8 8 0 0 1 20 12',
  audit: 'M9 5h6M9 5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2M9 11h6M9 15h4',
} as const;

function isActive(pathname: string, href: string, exact = false): boolean {
  if (href === '/panel') return pathname === '/panel';
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface Item {
  href: string;
  label: string;
  d: string;
  exact?: boolean;
  soon?: boolean; // sin página todavía
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const session = useSession();
  const pathname = usePathname();

  const activeKeys = new Set<string>((session.modules ?? []).map((m) => m.key));
  const has = (key: string) => activeKeys.has(key);
  const canVer = (mod: ModuleKey) => session.perms?.[mod]?.ver !== false;

  // sub=true solo para hijos de un grupo plegable (Cotizaciones dentro de Ventas…);
  // el resto de módulos van al nivel superior, todos alineados al mismo margen.
  const link = (it: Item, sub = false) => {
    const cls = `panel-nav-link${sub ? ' panel-nav-sub' : ''}`;
    if (it.soon) {
      return (
        <span key={it.href} className={cls} style={{ opacity: 0.45, cursor: 'default' }} title="Próximamente">
          <Icon d={it.d} />
          <span>{it.label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, opacity: 0.8 }}>PRONTO</span>
        </span>
      );
    }
    return (
      <Link
        key={it.href}
        href={it.href}
        className={cls}
        aria-current={isActive(pathname, it.href, it.exact) ? 'page' : undefined}
        onClick={onNavigate}
        title={it.label}
      >
        <Icon d={it.d} />
        <span>{it.label}</span>
      </Link>
    );
  };

  // ---- Composición de sectores según módulos activos ----
  // Los maestros (0026) ya no tienen sector propio: viven en Configuración →
  // Maestros, cada uno gated por su módulo (maestro_*).
  const ventas: Item[] = [
    ...(has('cotizaciones') ? [{ href: '/panel/cotizaciones', label: 'Cotizaciones', d: IC.doc }] : []),
    ...(has('ordenes') ? [{ href: '/panel/pedidos', label: 'Pedidos', d: IC.ventas }] : []),
  ];
  const compras: Item[] = has('compras')
    ? [
        { href: '/panel/compras/requisiciones', label: 'Requisiciones', d: IC.doc },
        { href: '/panel/compras', label: 'Órdenes de compra', d: IC.compras, exact: true },
      ]
    : [];
  const inventario: Item[] = has('inventario')
    ? [
        { href: '/panel/inventario', label: 'Existencias', d: IC.inventario, exact: true },
        { href: '/panel/inventario/entradas', label: 'Órdenes de entrada', d: IC.entrada },
        { href: '/panel/inventario/conteos', label: 'Conteos', d: IC.listas },
        { href: '/panel/inventario/traspasos', label: 'Traspasos', d: IC.entrada },
        { href: '/panel/inventario/valuacion', label: 'Valuación', d: IC.finanzas },
      ]
    : [];

  // Operación · entradas sueltas (no-grupo)
  const opDirect: Item[] = [
    ...(has('crm') ? [{ href: '/panel/crm', label: 'CRM Clientes', d: IC.clientes }] : []),
    ...(has('calendario') ? [{ href: '/panel/agenda', label: 'Agenda / Citas', d: IC.agenda }] : []),
    ...(has('expediente') ? [{ href: '/panel/expediente', label: 'Expediente clínico', d: IC.expediente }] : []),
    ...(has('facturacion') ? [{ href: '/panel/facturacion', label: 'Facturación', d: IC.facturacion, exact: true }] : []),
    ...(has('pagos') ? [{ href: '/panel/pagos', label: 'Pagos', d: IC.finanzas }] : []),
  ];

  const finanzas: Item[] = [
    ...(has('facturacion') ? [{ href: '/panel/facturacion/cxc', label: 'Cuentas por cobrar', d: IC.finanzas }] : []),
    ...(has('compras') ? [{ href: '/panel/compras/cxp', label: 'Cuentas por pagar', d: IC.finanzas }] : []),
  ];

  const admin: Item[] = [
    { href: '/panel/config', label: 'Configuración', d: IC.config },
    { href: '/panel/auditoria', label: 'Bitácora', d: IC.audit },
  ];

  return (
    <nav className="panel-nav" aria-label="Navegación principal">
      <Link
        href="/panel"
        className="panel-nav-link"
        aria-current={isActive(pathname, '/panel') ? 'page' : undefined}
        onClick={onNavigate}
      >
        <Icon d={IC.inicio} />
        <span>Inicio</span>
      </Link>

      {(ventas.length > 0 || compras.length > 0 || inventario.length > 0 || opDirect.length > 0) && (
        <div className="panel-nav-group-label">Operación</div>
      )}
      {ventas.length > 0 && <Group label="Ventas" d={IC.ventas} items={ventas} pathname={pathname} render={(it) => link(it, true)} />}
      {compras.length > 0 && <Group label="Compras" d={IC.compras} items={compras} pathname={pathname} render={(it) => link(it, true)} />}
      {inventario.length > 0 && <Group label="Inventario" d={IC.inventario} items={inventario} pathname={pathname} render={(it) => link(it, true)} />}
      {opDirect.map((it) => link(it))}

      {finanzas.length > 0 && (
        <>
          <div className="panel-nav-group-label">Finanzas</div>
          {finanzas.map((it) => link(it))}
        </>
      )}

      {canVer('config') && (
        <>
          <div className="panel-nav-group-label">Administración</div>
          {admin.map((it) => link(it))}
        </>
      )}
    </nav>
  );
}

/** Grupo plegable (Ventas/Compras/Inventario). Abierto si la ruta actual cae dentro. */
function Group({
  label,
  d,
  items,
  pathname,
  render,
}: {
  label: string;
  d: string;
  items: Item[];
  pathname: string;
  render: (it: Item) => React.ReactNode;
}) {
  const contains = items.some((it) => isActive(pathname, it.href, it.exact));
  const [open, setOpen] = useState(contains);
  return (
    <>
      <button
        type="button"
        className="panel-nav-link"
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon d={d} />
        <span>{label}</span>
        <span style={{ marginLeft: 'auto', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </button>
      {open && items.map(render)}
    </>
  );
}

export function SidebarBrand() {
  const session = useSession();
  const org = session.impersonating ?? session.organization;
  const roleLabel = ROLE_LABELS[session.role] ?? session.role;
  return (
    <>
      <div className="panel-brand" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {/* Logo Aplika (retícula 2×2 del brand kit) + wordmark, juntos. */}
        <span
          aria-hidden="true"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 2.5,
            width: 24,
            height: 24,
            flex: 'none',
          }}
        >
          <span style={{ background: '#378ADD', borderRadius: 4 }} />
          <span style={{ background: '#B5D4F4', borderRadius: 4 }} />
          <span style={{ background: '#B5D4F4', borderRadius: 4 }} />
          <span style={{ background: '#378ADD', borderRadius: 4 }} />
        </span>
        <span>
          Aplika<span className="panel-brand-dot">.ai</span>
        </span>
      </div>
      {org && (
        <div className="panel-org">
          <div className="panel-org-name">{org.name}</div>
          <div className="panel-org-role">{roleLabel}</div>
        </div>
      )}
    </>
  );
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  tenant_admin: 'Dueño / Admin',
  tenant_user: 'Operador',
  tenant_viewer: 'Solo lectura',
  customer: 'Cliente',
};
