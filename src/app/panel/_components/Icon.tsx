'use client';

/**
 * Icono SVG del panel. Los módulos de /api/erp/me traen `icon` como el atributo
 * `d` de un <path> (contrato SessionInfo.modules[].icon). Se renderiza en un
 * lienzo 24x24 con stroke, consistente con el brand kit.
 */

export function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Paths `d` para los enlaces CORE del panel (dashboard + maestros), que son
 * módulos siempre-activos (org_has_module devuelve true) y no siempre vienen
 * listados en session.modules. Los módulos OPERATIVOS sí se dibujan con el
 * `icon` dinámico que entrega el backend.
 */
export const CORE_ICONS = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  maestros: 'M4 7h16M4 12h16M4 17h10',
  clientes: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  productos: 'M20 7 12 3 4 7l8 4 8-4Zm0 0v10l-8 4-8-4V7',
  almacenes: 'M3 21V9l9-5 9 5v12M9 21v-6h6v6',
  listas: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
} as const;
