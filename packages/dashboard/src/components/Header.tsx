'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, auth, type AdminUser } from '../lib/api';

// Barra superior del panel; muestra "Salir" cuando hay sesión iniciada.
export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);

  // Recalcula el estado de sesión en cada navegación.
  useEffect(() => {
    setLoggedIn(auth.isAuthenticated());
    setUser(auth.getUser());
  }, [pathname]);

  const isAdmin = user?.role === 'admin';

  function logout() {
    api.logout();
    setLoggedIn(false);
    setUser(null);
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
            <Tab
              href="/capacitaciones"
              label="Capacitaciones"
              active={pathname.startsWith('/capacitaciones')}
            />
            <Tab href="/whatsapp" label="WhatsApp" active={pathname === '/whatsapp'} />
            <Tab
              href="/como-funciona"
              label="Cómo funciona"
              active={pathname === '/como-funciona'}
            />
            {isAdmin && (
              <Tab href="/usuarios" label="Usuarios" active={pathname === '/usuarios'} />
            )}
          </nav>
        )}
      </div>
      {loggedIn && pathname !== '/login' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {user && (
            <span style={{ fontSize: 13, fontWeight: 400, color: '#94a3b8' }}>
              {user.email}
              <span style={{
                marginLeft: 8, padding: '2px 8px', borderRadius: 10, fontSize: 11,
                background: isAdmin ? '#7c3aed' : user.role === 'instructor' ? '#c2410c' : '#0891b2',
                color: '#fff',
              }}>
                {isAdmin
                  ? 'Admin'
                  : `${user.role === 'instructor' ? 'Instructor' : 'Operador'} · ${user.sucursal ?? '—'}`}
              </span>
            </span>
          )}
          <button
            onClick={logout}
            style={{
              background: 'transparent', color: '#cbd5e1', border: '1px solid #334155',
              borderRadius: 8, padding: '6px 14px', fontSize: 14, cursor: 'pointer',
            }}
          >
            Salir
          </button>
        </div>
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
