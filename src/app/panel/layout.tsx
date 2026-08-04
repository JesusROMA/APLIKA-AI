import type { Metadata } from 'next';
import './panel.css';
import './print/print.css';
import { PanelShell } from './_components/PanelShell';

/**
 * Layout del panel ERP nuevo (React/Next.js, /panel). Server Component: sólo
 * monta la CSS del brand kit y delega el shell interactivo a <PanelShell>,
 * que es Client (necesita fetch de sesión + estado de nav/impersonación).
 *
 * Este ES el panel cliente (el panel dc anterior fue retirado): el login de
 * tenants redirige aquí; el super_admin conserva su panel dc de administración
 * y entra a este panel vía impersonación (cookie firmada multitenant).
 */

export const metadata: Metadata = {
  title: 'Panel · Aplika.ai',
  description: 'Panel de administración ERP de Aplika.ai',
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
