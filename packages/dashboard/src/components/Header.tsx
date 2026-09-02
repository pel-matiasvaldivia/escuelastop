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
  const showNav = loggedIn && pathname !== '/login';

  function logout() {
    api.logout();
    setLoggedIn(false);
    setUser(null);
    router.replace('/login');
  }

  const roleLabel = isAdmin
    ? 'Admin'
    : `${user?.role === 'instructor' ? 'Instructor' : 'Operador'} · ${user?.sucursal ?? '—'}`;
  const roleClass = isAdmin ? 'badge-violet' : user?.role === 'instructor' ? 'badge-warning' : 'badge-info';

  return (
    <header style={sx.header}>
      <div style={sx.inner}>
        <Link href={showNav ? '/' : '/login'} style={sx.brand}>
          <span style={sx.logo} aria-hidden>
            <span style={sx.logoDot} />
          </span>
          <span style={sx.brandText}>
            STOP <span style={sx.brandSub}>· Administración</span>
          </span>
        </Link>

        {showNav && (
          <nav style={sx.nav}>
            <Tab href="/conversaciones" label="Conversaciones"
              active={pathname.startsWith('/conversaciones') || pathname.startsWith('/contactos')} />
            <Tab href="/" label="Inscripciones"
              active={pathname === '/' || pathname.startsWith('/inscripciones')} />
            <Tab href="/caja" label="Caja" active={pathname.startsWith('/caja')} />
            <Tab href="/capacitaciones" label="Capacitaciones" active={pathname.startsWith('/capacitaciones')} />
            {isAdmin && (
              <Tab href="/configuracion" label="Configuración"
                active={pathname.startsWith('/configuracion') || pathname === '/whatsapp' || pathname === '/usuarios'} />
            )}
            <Tab href="/como-funciona" label="Cómo funciona" active={pathname === '/como-funciona'} />
          </nav>
        )}

        <div style={{ flex: 1 }} />

        {showNav && user && (
          <div style={sx.right}>
            <div style={sx.userBox}>
              <span style={sx.email}>{user.email}</span>
              <span className={`badge ${roleClass}`} style={{ fontSize: 10.5 }}>{roleLabel}</span>
            </div>
            <button onClick={logout} className="btn btn-sm" style={sx.logout}>Salir</button>
          </div>
        )}
      </div>
    </header>
  );
}

/** Solapa de navegación del panel. */
function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} style={{ ...sx.tab, ...(active ? sx.tabActive : null) }}>
      {label}
    </Link>
  );
}

const sx: Record<string, React.CSSProperties> = {
  header: {
    position: 'sticky', top: 0, zIndex: 50,
    background: 'linear-gradient(180deg, #0b1220 0%, #0f172a 100%)',
    borderBottom: '1px solid rgba(148,163,184,0.14)',
    boxShadow: '0 1px 0 rgba(255,255,255,0.03), 0 8px 24px -16px rgba(0,0,0,0.6)',
  },
  inner: {
    maxWidth: 1160, margin: '0 auto', height: 'var(--header-h)',
    padding: '0 24px', display: 'flex', alignItems: 'center', gap: 22,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none' },
  logo: {
    width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center',
    background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
    boxShadow: '0 2px 10px -2px rgba(239,68,68,0.6)',
  },
  logoDot: { width: 11, height: 11, borderRadius: '50%', background: '#fff', boxShadow: 'inset 0 0 0 3px #b91c1c' },
  brandText: { color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' },
  brandSub: { color: '#94a3b8', fontWeight: 500, fontSize: 13 },
  nav: { display: 'flex', gap: 2, alignItems: 'center' },
  tab: {
    color: '#94a3b8', padding: '7px 13px', borderRadius: 9, fontSize: 13.5,
    fontWeight: 500, textDecoration: 'none', transition: 'background .15s, color .15s',
  },
  tabActive: { color: '#fff', background: 'rgba(255,255,255,0.10)', fontWeight: 600 },
  right: { display: 'flex', alignItems: 'center', gap: 12 },
  userBox: { display: 'flex', alignItems: 'center', gap: 9 },
  email: { fontSize: 12.5, color: '#cbd5e1', fontWeight: 500 },
  logout: {
    background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
    borderColor: 'rgba(148,163,184,0.28)',
  },
};
