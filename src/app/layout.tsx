import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Aplika.ai',
  description: 'Plataformas + Agentes de IA para PYMEs',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-MX">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
