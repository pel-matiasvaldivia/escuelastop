'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sub-navegación de la sección Configuración. Agrupa la configuración general,
 * la vinculación de WhatsApp y la gestión de usuarios bajo una misma barra.
 */
const TABS = [
  { href: '/configuracion', label: 'General' },
  { href: '/whatsapp', label: 'WhatsApp' },
  { href: '/usuarios', label: 'Usuarios' },
];

export default function ConfigTabs() {
  const path = usePathname();
  return (
    <div style={bar}>
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} style={{ ...tab, ...(active ? tabActive : null) }}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

const bar: React.CSSProperties = {
  display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12,
  background: 'var(--surface-3)', border: '1px solid var(--border)', marginBottom: 4,
};
const tab: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 9, fontSize: 14, fontWeight: 600,
  color: 'var(--muted)', textDecoration: 'none',
};
const tabActive: React.CSSProperties = {
  background: 'var(--surface)', color: 'var(--brand-600)', boxShadow: 'var(--shadow-sm)',
};
