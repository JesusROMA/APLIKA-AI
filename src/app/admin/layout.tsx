import type { Metadata } from 'next';
import '../panel/panel.css';

/**
 * Layout de la Torre de Control del super-admin (/admin). Reusa los tokens y
 * componentes visuales del panel (panel.css) con un shell propio y ligero: el
 * super-admin no opera un tenant aquí, administra la plataforma. La gestión
 * profunda (tenants, planes, incidencias, respuestas WhatsApp) sigue en el
 * panel dc: /dc/Panel Super-admin.dc.html.
 */

export const metadata: Metadata = {
  title: 'Torre de control · Aplika.ai',
  description: 'Administración de la plataforma Aplika.ai',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-shell">{children}</div>;
}
