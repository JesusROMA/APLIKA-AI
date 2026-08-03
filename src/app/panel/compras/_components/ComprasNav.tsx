'use client';

/**
 * Barra de navegación del área de Compras (F5 · Tanda B). Enlaces a Órdenes,
 * Proveedores y Cuentas por pagar; resalta la sección activa según la ruta.
 * Los subárboles de Proveedores/CxP son propiedad de otros agentes; aquí sólo
 * se enlazan.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { href: string; label: string }[] = [
  { href: '/panel/compras', label: 'Órdenes' },
  { href: '/panel/compras/proveedores', label: 'Proveedores' },
  { href: '/panel/compras/cxp', label: 'Cuentas por pagar' },
];

export function ComprasNav() {
  const pathname = usePathname() ?? '';

  function isActive(href: string): boolean {
    if (href === '/panel/compras') {
      // "Órdenes" activo en la raíz y en cualquier detalle/alta de OC, pero no
      // cuando estamos dentro de Proveedores o CxP.
      return (
        pathname === '/panel/compras' ||
        (pathname.startsWith('/panel/compras/') &&
          !pathname.startsWith('/panel/compras/proveedores') &&
          !pathname.startsWith('/panel/compras/cxp'))
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      aria-label="Secciones de compras"
      style={{
        display: 'flex',
        gap: 'var(--sp-1)',
        flexWrap: 'wrap',
        marginBottom: 'var(--sp-3)',
      }}
    >
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`pbtn ${isActive(t.href) ? 'pbtn--primary' : 'pbtn--ghost'}`}
          aria-current={isActive(t.href) ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
