import type { ReactNode } from 'react';
import Header from '../components/Header';

export const metadata = {
  title: 'STOP · Administración',
  description: 'Panel de administración — Escuela de Manejo STOP',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#f5f6f8' }}>
        <Header />
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
