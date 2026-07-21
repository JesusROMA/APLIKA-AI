import type { Metadata } from 'next';
import './panel.css';
import './print/print.css';
import { PanelShell } from './_components/PanelShell';

/**
 * Layout del panel ERP nuevo (React/Next.js, /panel). Server Component: sólo
 * monta la CSS del brand kit y delega el shell interactivo a <PanelShell>,
 * que es Client (necesita fetch de sesión + estado de nav/impersonación).
 *
 * NOTA (Tanda C · orquestador): el login existente
 * (public/dc/Login.dc.html) hoy redirige a /dc/Panel Cliente.dc.html. El
 * cambio del destino de login hacia /panel es DECISIÓN DEL ORQUESTADOR, no de
 * AGENTE-UI. Este panel queda accesible directamente en /panel.
 */

export const metadata: Metadata = {
  title: 'Panel · Aplika.ai',
  description: 'Panel de administración ERP de Aplika.ai',
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
