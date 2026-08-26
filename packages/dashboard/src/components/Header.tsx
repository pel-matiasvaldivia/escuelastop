'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, auth } from '../lib/api';

// Barra superior del panel; muestra "Salir" cuando hay sesión iniciada.
export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  // Recalcula el estado de sesión en cada navegación.
  useEffect(() => {
    setLoggedIn(auth.isAuthenticated());
  }, [pathname]);

  function logout() {
    api.logout();
    setLoggedIn(false);
    router.replace('/login');
  }

  return (
    <header
      style={{
        background: '#0f172a', color: '#fff', padding: '14px 24px',
        fontWeight: 600, fontSize: 18, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <span>🚗 STOP · Panel de administración</span>
        {loggedIn && pathname !== '/login' && (
          <nav style={{ display: 'flex', gap: 4 }}>
            <Tab href="/" label="Inscripciones" active={pathname === '/'} />
            <Tab href="/whatsapp" label="WhatsApp" active={pathname === '/whatsapp'} />
          </nav>
        )}
      </div>
      {loggedIn && pathname !== '/login' && (
        <button
          onClick={logout}
          style={{
            background: 'transparent', color: '#cbd5e1', border: '1px solid #334155',
            borderRadius: 8, padding: '6px 14px', fontSize: 14, cursor: 'pointer',
          }}
        >
          Salir
        </button>
      )}
    </header>
  );
}

/** Solapa de navegación del panel. */
function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        color: active ? '#fff' : '#94a3b8',
        background: active ? '#1e293b' : 'transparent',
        padding: '6px 14px', borderRadius: 8, fontSize: 14,
        fontWeight: active ? 600 : 400, textDecoration: 'none',
      }}
    >
      {label}
    </Link>
  );
}
