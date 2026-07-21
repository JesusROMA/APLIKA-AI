'use client';

/**
 * Navegación superior del módulo Inventario. Enlaces a las áreas: Existencias,
 * Conteos, Traspasos y Valuación. La sección activa se marca con `aria-current`.
 * Reusa las clases `pbtn` del brand kit (sin CSS propio).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/panel/inventario', label: 'Existencias', exact: true },
  { href: '/panel/inventario/conteos', label: 'Conteos' },
  { href: '/panel/inventario/traspasos', label: 'Traspasos' },
  { href: '/panel/inventario/valuacion', label: 'Valuación' },
];

export function InventarioNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones de inventario"
      style={{ display: 'flex', gap: 'var(--sp-1)', flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}
    >
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`pbtn pbtn--sm ${active ? 'pbtn--primary' : 'pbtn--ghost'}`}
            aria-current={active ? 'page' : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
