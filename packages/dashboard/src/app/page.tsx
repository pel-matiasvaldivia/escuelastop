'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, auth, UnauthorizedError, type Contact, type Enrollment } from '../lib/api';

// Panel principal: bandeja de inscripciones + leads recientes.
export default function HomePage() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [e, c] = await Promise.all([api.enrollments(), api.contacts()]);
        setEnrollments(e);
        setContacts(c);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          router.replace('/login');
          return;
        }
        setError('No se pudo conectar con la API. ¿Está corriendo el backend?');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p style={{ color: '#64748b' }}>Cargando…</p>;
  if (error) return <p style={{ color: '#b91c1c' }}>{error}</p>;

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <section>
        <h2>Inscripciones</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Curso</th>
              <th style={th}>Sede</th>
              <th style={th}>Estado</th>
              <th style={th}>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.length === 0 && (
              <tr><td style={td} colSpan={4}>Sin inscripciones todavía.</td></tr>
            )}
            {enrollments.map((e) => (
              <tr key={e.id}>
                <td style={td}>{e.course ?? '—'}</td>
                <td style={td}>{e.sede ?? '—'}</td>
                <td style={td}><StatusBadge status={e.status} /></td>
                <td style={td}>{new Date(e.updated_at).toLocaleString('es-AR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Leads / Contactos</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Nombre</th>
              <th style={th}>Teléfono</th>
              <th style={th}>Interés</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr><td style={td} colSpan={4}>Sin contactos todavía.</td></tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id}>
                <td style={td}>{c.full_name ?? '(sin nombre)'}</td>
                <td style={td}>{c.phone ?? '—'}</td>
                <td style={td}>{c.interest ?? '—'}</td>
                <td style={td}>
                  <Link href={`/contactos/${c.id}`} style={{ color: '#2563eb' }}>
                    Ver conversación →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    nuevo: '#64748b', contactado: '#0891b2', inscripto: '#7c3aed',
    pagado: '#16a34a', completado: '#15803d', cancelado: '#dc2626',
    pendiente_verificacion: '#ea580c',
  };
  return (
    <span style={{
      background: colors[status] ?? '#64748b', color: '#fff',
      padding: '2px 10px', borderRadius: 12, fontSize: 12,
    }}>
      {status}
    </span>
  );
}

const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, background: '#fff' };
const th = { textAlign: 'left' as const, padding: 10, borderBottom: '2px solid #e2e8f0', fontSize: 13, color: '#475569' };
const td = { padding: 10, borderBottom: '1px solid #eef2f7', fontSize: 14 };
