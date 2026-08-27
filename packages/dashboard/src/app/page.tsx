'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  api, auth, UnauthorizedError,
  type Contact, type Enrollment, type SucursalInfo,
} from '../lib/api';

// Panel principal: bandeja de inscripciones + leads recientes.
export default function HomePage() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sucursales, setSucursales] = useState<SucursalInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = auth.isAdmin();

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [e, c, s] = await Promise.all([
          api.enrollments(), api.contacts(), api.sucursales(),
        ]);
        setEnrollments(e);
        setContacts(c);
        setSucursales(s);
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

  // Reasignar una inscripción a otra sucursal (solo admin).
  async function reassign(enrollmentId: string, sede: string) {
    if (!sede) return;
    try {
      const updated = await api.assignSucursal(enrollmentId, sede);
      setEnrollments((prev) => prev.map((e) => (e.id === enrollmentId ? updated : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reasignar');
    }
  }

  if (loading) return <p style={{ color: '#64748b' }}>Cargando…</p>;
  if (error) return <p style={{ color: '#b91c1c' }}>{error}</p>;

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <section>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 10,
        }}>
          <h2 style={{ margin: 0 }}>Inscripciones</h2>
          <Link href="/inscripciones/nueva" style={{
            padding: '9px 18px', background: '#0f172a', color: '#fff',
            borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}>
            + Nueva inscripción
          </Link>
        </div>
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
                <td style={td}>
                  {isAdmin ? (
                    <select
                      value={e.sede ?? ''}
                      onChange={(ev) => reassign(e.id, ev.target.value)}
                      style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                    >
                      <option value="" disabled>Sin sucursal</option>
                      {sucursales.map((s) => (
                        <option key={s.id} value={s.nombre}>{s.nombre}</option>
                      ))}
                    </select>
                  ) : (
                    e.sede ?? '—'
                  )}
                </td>
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
