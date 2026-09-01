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

  if (loading) {
    return (
      <div className="empty"><span className="spinner" /> <span style={{ marginLeft: 8 }}>Cargando panel…</span></div>
    );
  }
  if (error) {
    return <div className="card card-pad" style={{ color: 'var(--danger)', borderColor: 'var(--danger-br)', background: 'var(--danger-bg)' }}>{error}</div>;
  }

  // KPIs
  const preinscriptos = enrollments.filter((e) => e.status === 'preinscripto').length;
  const pendientePago = enrollments.filter((e) => e.payment_status === 'aprobado' && !e.pago_completo).length;
  const completos = enrollments.filter((e) => e.pago_completo).length;

  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Panel</div>
          <h1>Inscripciones</h1>
          <div className="sub">Seguimiento del proceso de inscripción, pagos y cupos.</div>
        </div>
        <Link href="/inscripciones/nueva" className="btn btn-primary">+ Nueva inscripción</Link>
      </div>

      <div className="stat-grid">
        <Stat ico="📋" tint="var(--brand-050)" label="Inscripciones" value={enrollments.length} />
        <Stat ico="🧾" tint="var(--warning-bg)" label="Pre-inscriptos" value={preinscriptos} />
        <Stat ico="⏳" tint="var(--warning-bg)" label="Pago pendiente" value={pendientePago} />
        <Stat ico="✅" tint="var(--success-bg)" label="Pago completo" value={completos} />
        <Stat ico="👥" tint="var(--info-bg)" label="Leads" value={contacts.length} />
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Bandeja de inscripciones</h2>
          <span className="badge">{enrollments.length}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Curso</th>
                <th>Sede</th>
                <th>Pago</th>
                <th>Curso / cupo</th>
                <th>Estado</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.length === 0 && (
                <tr><td colSpan={6}><div className="empty">Sin inscripciones todavía.</div></td></tr>
              )}
              {enrollments.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600 }}>{e.course ?? '—'}</td>
                  <td>
                    {isAdmin ? (
                      <select
                        className="select"
                        value={e.sede ?? ''}
                        onChange={(ev) => reassign(e.id, ev.target.value)}
                        style={{ padding: '6px 8px', fontSize: 13, width: 'auto', minWidth: 130 }}
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
                  <td><PaymentCell e={e} busy={payBusyId === e.id} onComplete={() => completePay(e.id)} /></td>
                  <td><CohorteCell e={e} /></td>
                  <td><StatusBadge status={e.status} /></td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {new Date(e.updated_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Leads / Contactos</h2>
          <span className="badge">{contacts.length}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Interés</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 && (
                <tr><td colSpan={4}><div className="empty">Sin contactos todavía.</div></td></tr>
              )}
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.full_name ?? '(sin nombre)'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{c.phone ?? '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{c.interest ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Link href={`/contactos/${c.id}`} className="btn btn-ghost btn-sm">Ver conversación →</Link>
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

function Stat({ ico, label, value, tint }: { ico: string; label: string; value: number; tint: string }) {
  return (
    <div className="card stat">
      <div className="stat-label">
        <span className="stat-ico" style={{ background: tint }}>{ico}</span>
        {label}
      </div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

/** Completud del pago: seña (anticipo) + estado del pago total. */
function PaymentCell({
  e, busy, onComplete,
}: { e: Enrollment; busy: boolean; onComplete: () => void }) {
  const senaPaga = e.payment_status === 'aprobado';
  const pagoCompleto = !!e.pago_completo;
  const senaClass = senaPaga ? 'badge-success' : e.payment_status === 'rechazado' ? 'badge-danger' : 'badge-warning';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <span className={`badge ${senaClass}`}>{senaPaga ? 'seña paga' : e.payment_status}</span>
        {e.payment_amount != null && (
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>${e.payment_amount.toLocaleString('es-AR')}</span>
        )}
      </span>
      {pagoCompleto ? (
        <span className="badge badge-success">✓ Pago completo</span>
      ) : senaPaga ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span className="badge badge-warning">⏳ Falta el total</span>
          <button onClick={onComplete} disabled={busy} className="btn btn-success btn-sm">
            {busy ? <span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.4)' }} /> : 'Registrar pago'}
          </button>
        </span>
      ) : null}
    </div>
  );
}

/** Cohorte en el que quedó matriculado + estado del cupo. */
function CohorteCell({ e }: { e: Enrollment }) {
  if (!e.curso_nombre) return <span style={{ color: 'var(--muted-2)' }}>—</span>;
  const inicio = e.curso_fecha_inicio
    ? new Date(e.curso_fecha_inicio).toLocaleDateString('es-AR')
    : null;
  const cupo = e.curso_cupo_maximo != null ? `${e.curso_activos ?? 0}/${e.curso_cupo_maximo}` : `${e.curso_activos ?? 0}`;
  const lleno = e.curso_cupo_maximo != null && (e.curso_activos ?? 0) >= e.curso_cupo_maximo;
  return (
    <span style={{ fontSize: 13 }}>
      <b>{e.curso_nombre}</b>
      <br />
      <span style={{ color: 'var(--muted)' }}>
        {inicio ? `Inicia ${inicio} · ` : ''}
        <span className={`badge ${lleno ? 'badge-danger' : 'badge-success'}`} style={{ padding: '1px 8px' }}>cupo {cupo}</span>
      </span>
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  nuevo: 'Nuevo', contactado: 'Contactado', inscripto: 'Inscripto', pagado: 'Pagado',
  completado: 'Completado', cancelado: 'Cancelado', pendiente_verificacion: 'Verificación',
  preinscripto: 'Pre-inscripto',
};
const STATUS_CLASS: Record<string, string> = {
  nuevo: 'badge', contactado: 'badge-info', inscripto: 'badge-violet',
  pagado: 'badge-success', completado: 'badge-success', cancelado: 'badge-danger',
  pendiente_verificacion: 'badge-warning', preinscripto: 'badge-warning',
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? 'badge'}`}>{STATUS_LABEL[status] ?? status}</span>;
}
