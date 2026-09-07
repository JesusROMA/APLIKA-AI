'use client';

/**
 * Configuración → Maestros (0026). Punto de entrada a los catálogos maestros
 * del tenant: cada tarjeta abre su página y solo aparece si el módulo
 * `maestro_*` está activo para la organización (los asigna el super-admin por
 * cliente) y el rol puede verlo.
 */

import Link from 'next/link';
import type { ModuleKey } from '@/lib/types/erp';
import { useCan, useSession } from '../../_components/session';
import { EmptyState } from '../../_components/States';
import { Icon } from '../../_components/Icon';

interface MaestroCard {
  key: ModuleKey;
  href: string;
  label: string;
  desc: string;
  d: string;
}

const CARDS: MaestroCard[] = [
  {
    key: 'maestro_clientes',
    href: '/panel/clientes',
    label: 'Clientes',
    desc: 'Padrón de clientes: datos SAT, lista de precios, crédito y saldo.',
    d: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  },
  {
    key: 'maestro_proveedores',
    href: '/panel/compras/proveedores',
    label: 'Proveedores',
    desc: 'Proveedores de compra: contacto, días de pago y saldo por pagar.',
    d: 'M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  },
  {
    key: 'maestro_productos',
    href: '/panel/productos',
    label: 'Productos',
    desc: 'Catálogo de productos y variantes: SKU, precio base e IVA.',
    d: 'M20 7 12 3 4 7l8 4 8-4Zm0 0v10l-8 4-8-4V7',
  },
  {
    key: 'maestro_almacenes',
    href: '/panel/almacenes',
    label: 'Almacenes',
    desc: 'Ubicaciones de inventario; define el almacén predeterminado.',
    d: 'M3 21V9l9-5 9 5v12M9 21v-6h6v6',
  },
  {
    key: 'maestro_precios',
    href: '/panel/listas-precios',
    label: 'Listas de precios',
    desc: 'Precios pactados por lista; se asignan por cliente.',
    d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  },
];

export function MaestrosTab() {
  const session = useSession();
  const can = useCan();
  const active = new Set((session.modules ?? []).map((m) => m.key));
  const visible = CARDS.filter((c) => active.has(c.key) && can(c.key, 'ver'));

  if (visible.length === 0) {
    return (
      <EmptyState
        title="Sin maestros asignados"
        message="Tu organización no tiene módulos de maestros activos. Contacta a Aplika para habilitarlos."
      />
    );
  }

  return (
    <div>
      <div className="panel-page-head">
        <div>
          <h3 className="panel-page-title" style={{ fontSize: 'var(--fs-lg, 1.1rem)' }}>
            Maestros
          </h3>
          <p className="panel-page-sub">
            Los catálogos que alimentan toda la operación. Se asignan por cliente desde Aplika.
          </p>
        </div>
      </div>
      <div className="maestros-grid">
        {visible.map((c) => (
          <Link key={c.key} href={c.href} className="maestro-card">
            <span className="maestro-card-icon">
              <Icon d={c.d} />
            </span>
            <span className="maestro-card-body">
              <span className="maestro-card-title">{c.label}</span>
              <span className="maestro-card-desc">{c.desc}</span>
            </span>
            <span className="maestro-card-go" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
