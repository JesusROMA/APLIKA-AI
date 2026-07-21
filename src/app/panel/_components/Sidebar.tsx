'use client';

/**
 * Nav lateral del panel. Se construye DINÁMICAMENTE desde session.modules
 * (contrato: los módulos operativos activos vienen del backend con su icon/
 * routePrefix). Dashboard y Maestros son módulos CORE siempre-activos
 * (org_has_module → true) que no siempre se listan en modules[]; se dibujan
 * como enlaces fijos y se ocultan sólo si el permiso 'ver' es explícitamente
 * false. Activar/desactivar un módulo operativo en el backend cambia el menú.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from './session';
import { Icon, CORE_ICONS } from './Icon';

const MAESTROS_LINKS = [
  { href: '/panel/clientes', label: 'Clientes', d: CORE_ICONS.clientes },
  { href: '/panel/productos', label: 'Productos', d: CORE_ICONS.productos },
  { href: '/panel/almacenes', label: 'Almacenes', d: CORE_ICONS.almacenes },
  { href: '/panel/listas-precios', label: 'Listas de precios', d: CORE_ICONS.listas },
];

/**
 * Ruta del panel React por key de módulo. Desacopla la nav de React del
 * `route_prefix` de la BD (que usa el panel dc antiguo). Los módulos sin página
 * propia todavía (F2+) caen a `/panel/{key}`.
 */
const MODULE_ROUTES: Record<string, string> = {
  ordenes: '/panel/pedidos',
  cotizaciones: '/panel/cotizaciones',
  facturacion: '/panel/facturacion',
  inventario: '/panel/inventario',
};

function isActive(pathname: string, href: string): boolean {
  if (href === '/panel') return pathname === '/panel';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const session = useSession();
  const pathname = usePathname();

  // Módulos operativos dinámicos (excluimos los core que dibujamos fijos).
  const operative = (session.modules ?? []).filter(
    (m) => m.key !== 'dashboard' && m.key !== 'maestros',
  );

  const showMaestros = session.perms?.maestros?.ver !== false;

  const navLink = (href: string, d: string, label: string, sub = false) => (
    <Link
      key={href}
      href={href}
      className={`panel-nav-link${sub ? ' panel-nav-sub' : ''}`}
      aria-current={isActive(pathname, href) ? 'page' : undefined}
      onClick={onNavigate}
      title={label}
    >
      <Icon d={d} />
      <span>{label}</span>
    </Link>
  );

  return (
    <nav className="panel-nav" aria-label="Navegación principal">
      {navLink('/panel', CORE_ICONS.dashboard, 'Inicio')}

      {showMaestros && (
        <>
          <div className="panel-nav-group-label">Maestros</div>
          {MAESTROS_LINKS.map((l) => navLink(l.href, l.d, l.label, true))}
        </>
      )}

      {operative.length > 0 && (
        <>
          <div className="panel-nav-group-label">Módulos</div>
          {operative.map((m) =>
            navLink(MODULE_ROUTES[m.key] ?? `/panel/${m.key}`, m.icon, m.label),
          )}
        </>
      )}
    </nav>
  );
}

export function SidebarBrand() {
  const session = useSession();
  const org = session.impersonating ?? session.organization;
  const roleLabel = ROLE_LABELS[session.role] ?? session.role;
  return (
    <>
      <div className="panel-brand">
        <span>Aplika</span>
        <span className="panel-brand-dot">.ai</span>
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
