'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, auth, UnauthorizedError, type Contact } from '../../lib/api';

/**
 * Conversaciones: lista de contactos/alumnos que escribieron por WhatsApp. Desde
 * acá se abre la conversación de cada uno. Es la primera sección del panel.
 */
export default function ConversacionesPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!auth.isAuthenticated()) { router.replace('/login'); return; }
    (async () => {
      try {
        setContacts(await api.contacts());
      } catch (err) {
        if (err instanceof UnauthorizedError) { router.replace('/login'); return; }
        setError('No se pudieron cargar las conversaciones.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return contacts;
    return contacts.filter((c) =>
      (c.full_name ?? '').toLowerCase().includes(t) ||
      (c.phone ?? '').toLowerCase().includes(t) ||
      (c.dni ?? '').toLowerCase().includes(t) ||
      (c.interest ?? '').toLowerCase().includes(t));
  }, [contacts, q]);

  if (loading) return <div className="empty"><span className="spinner" /> <span style={{ marginLeft: 8 }}>Cargando conversaciones…</span></div>;
  if (error) return <div className="card card-pad" style={{ color: 'var(--danger)', borderColor: 'var(--danger-br)', background: 'var(--danger-bg)' }}>{error}</div>;

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Panel</div>
          <h1>Conversaciones</h1>
          <div className="sub">Alumnos y leads que escribieron por WhatsApp. Abrí un chat para responder.</div>
        </div>
      </div>

      <section className="card">
        <div className="card-head" style={{ gap: 12, flexWrap: 'wrap' }}>
          <h2>Contactos</h2>
          <span className="badge">{filtered.length}</span>
        </div>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <input
            className="input"
            placeholder="🔎 Buscar por nombre, teléfono, DNI o interés…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 420 }}
          />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Interés</th>
                <th>Estado del bot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5}><div className="empty">
                  {q ? 'No hay contactos que coincidan con la búsqueda.' : 'Sin conversaciones todavía.'}
                </div></td></tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/contactos/${c.id}`)}>
                  <td style={{ fontWeight: 600 }}>{c.full_name ?? '(sin nombre)'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{c.phone ?? '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{c.interest ?? '—'}</td>
                  <td>
                    <span className={`badge ${c.bot_paused ? 'badge-warning' : 'badge-success'}`}>
                      {c.bot_paused ? '⏸️ Operador' : '🤖 Bot'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link href={`/contactos/${c.id}`} className="btn btn-ghost btn-sm" onClick={(e) => e.stopPropagation()}>
                      Ver conversación →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
