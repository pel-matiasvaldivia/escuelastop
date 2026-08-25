'use client';

import { useEffect, useState } from 'react';
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
      <span>🚗 STOP · Panel de administración</span>
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
