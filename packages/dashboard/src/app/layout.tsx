import type { ReactNode } from 'react';
import Header from '../components/Header';
import './globals.css';

export const metadata = {
  title: 'STOP · Administración',
  description: 'Panel de administración — Escuela de Manejo STOP',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div style={{ minHeight: '100vh', background: 'var(--bg)', backgroundImage: 'var(--bg-grad)', backgroundAttachment: 'fixed' }}>
          <Header />
          <main className="app-main fade-in">{children}</main>
        </div>
      </body>
    </html>
  );
}
