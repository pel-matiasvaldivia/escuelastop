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

  const [payBusyId, setPayBusyId] = useState<string | null>(null);

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

  // Registrar el pago total (la seña era un anticipo): habilita el código y
  // notifica al alumno. El backend valida el acceso por sucursal.
  async function completePay(enrollmentId: string) {
    if (!confirm('¿Confirmás que el alumno completó el pago total del curso? ' +
      'Se habilita su código y se le avisa por WhatsApp y mail.')) return;
    setPayBusyId(enrollmentId);
    try {
      const updated = await api.completePayment(enrollmentId);
      setEnrollments((prev) => prev.map((e) => (e.id === enrollmentId ? { ...e, ...updated } : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    } finally {
      setPayBusyId(null);
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
              <th style={th}>Pago</th>
              <th style={th}>Curso / cupo</th>
              <th style={th}>Estado</th>
              <th style={th}>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.length === 0 && (
              <tr><td style={td} colSpan={6}>Sin inscripciones todavía.</td></tr>
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
                <td style={td}>
                  <PaymentCell
                    e={e}
                    busy={payBusyId === e.id}
                    onComplete={() => completePay(e.id)}
                  />
                </td>
                <td style={td}><CohorteCell e={e} /></td>
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

/** Completud del pago: seña (anticipo) + estado del pago total. */
function PaymentCell({
  e, busy, onComplete,
}: { e: Enrollment; busy: boolean; onComplete: () => void }) {
  const colors: Record<string, string> = {
    aprobado: '#16a34a', pendiente: '#ea580c', rechazado: '#dc2626',
  };
  const senaPaga = e.payment_status === 'aprobado';
  const pagoCompleto = !!e.pago_completo;
  return (
    <span style={{ fontSize: 13, display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <span>
        <span style={{
          background: colors[e.payment_status] ?? '#64748b', color: '#fff',
          padding: '2px 8px', borderRadius: 12, fontSize: 12,
        }}>
          {senaPaga ? 'seña paga' : e.payment_status}
        </span>
        {e.payment_amount != null && (
          <span style={{ color: '#475569', marginLeft: 6 }}>
            ${e.payment_amount.toLocaleString('es-AR')}
          </span>
        )}
      </span>
      {pagoCompleto ? (
        <span style={{ color: '#15803d', fontWeight: 600 }}>✓ Pago completo</span>
      ) : senaPaga ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#b45309' }}>⏳ Pendiente de completar pago</span>
          <button
            onClick={onComplete}
            disabled={busy}
            style={{
              padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? '…' : 'Registrar pago'}
          </button>
        </span>
      ) : null}
    </span>
  );
}

/** Cohorte en el que quedó matriculado + estado del cupo. */
function CohorteCell({ e }: { e: Enrollment }) {
  if (!e.curso_nombre) return <span style={{ color: '#94a3b8' }}>—</span>;
  const inicio = e.curso_fecha_inicio
    ? new Date(e.curso_fecha_inicio).toLocaleDateString('es-AR')
    : null;
  const cupo = e.curso_cupo_maximo != null
    ? `${e.curso_activos ?? 0}/${e.curso_cupo_maximo}`
    : `${e.curso_activos ?? 0}`;
  const lleno = e.curso_cupo_maximo != null && (e.curso_activos ?? 0) >= e.curso_cupo_maximo;
  return (
    <span style={{ fontSize: 13 }}>
      <b>{e.curso_nombre}</b>
      <br />
      <span style={{ color: '#475569' }}>
        {inicio ? `Inicia ${inicio} · ` : ''}
        <span style={{ color: lleno ? '#dc2626' : '#16a34a' }}>cupo {cupo}</span>
      </span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    nuevo: '#64748b', contactado: '#0891b2', inscripto: '#7c3aed',
    pagado: '#16a34a', completado: '#15803d', cancelado: '#dc2626',
    pendiente_verificacion: '#ea580c', preinscripto: '#d97706',
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
