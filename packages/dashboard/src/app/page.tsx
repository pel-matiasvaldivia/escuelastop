'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  api, auth, UnauthorizedError,
  type Enrollment, type SucursalInfo, type Course, type EnrollmentStats,
} from '../lib/api';

const PAGE_SIZE = 25;

// Panel principal: bandeja de inscripciones (con búsqueda, filtros y paginación).
export default function HomePage() {
  const router = useRouter();
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<EnrollmentStats | null>(null);
  const [sucursales, setSucursales] = useState<SucursalInfo[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);

  // Filtros.
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [course, setCourse] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);

  const isAdmin = auth.isAdmin();

  // Carga inicial (datos que no dependen de los filtros).
  useEffect(() => {
    if (!auth.isAuthenticated()) { router.replace('/login'); return; }
    (async () => {
      try {
        const [s, cat, st] = await Promise.all([
          api.sucursales(), api.catalog(), api.enrollmentStats(),
        ]);
        setSucursales(s); setCourses(cat); setStats(st);
      } catch (err) {
        if (err instanceof UnauthorizedError) { router.replace('/login'); return; }
        setError('No se pudo conectar con la API. ¿Está corriendo el backend?');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce del texto de búsqueda.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Al cambiar un filtro, volver a la primera página.
  useEffect(() => { setPage(1); }, [qDebounced, course, desde, hasta]);

  // Carga de la bandeja según filtros + página.
  useEffect(() => {
    if (!auth.isAuthenticated()) return;
    let cancelled = false;
    setListLoading(true);
    api.enrollments({ q: qDebounced, course, desde, hasta, page, pageSize: PAGE_SIZE })
      .then((res) => { if (!cancelled) { setRows(res.rows); setTotal(res.total); } })
      .catch((err) => { if (!cancelled && !(err instanceof UnauthorizedError)) setError('No se pudo cargar la bandeja.'); })
      .finally(() => { if (!cancelled) setListLoading(false); });
    return () => { cancelled = true; };
  }, [qDebounced, course, desde, hasta, page]);

  const [payBusyId, setPayBusyId] = useState<string | null>(null);

  async function reassign(enrollmentId: string, sede: string) {
    if (!sede) return;
    try {
      const updated = await api.assignSucursal(enrollmentId, sede);
      setRows((prev) => prev.map((e) => (e.id === enrollmentId ? { ...e, ...updated } : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reasignar');
    }
  }

  async function completePay(enrollmentId: string) {
    if (!confirm('¿Confirmás que el alumno completó el pago total del curso? ' +
      'Se habilita su código y se le avisa por WhatsApp y mail.')) return;
    setPayBusyId(enrollmentId);
    try {
      const updated = await api.completePayment(enrollmentId);
      setRows((prev) => prev.map((e) => (e.id === enrollmentId ? { ...e, ...updated } : e)));
      api.enrollmentStats().then(setStats).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    } finally {
      setPayBusyId(null);
    }
  }

  function limpiar() { setQ(''); setCourse(''); setDesde(''); setHasta(''); }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hayFiltros = !!(qDebounced || course || desde || hasta);
  const desdeN = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const hastaN = Math.min(page * PAGE_SIZE, total);

  // Nombres de curso únicos para el filtro (del catálogo).
  const courseNames = useMemo(() => courses.map((c) => c.name), [courses]);

  if (loading) {
    return <div className="empty"><span className="spinner" /> <span style={{ marginLeft: 8 }}>Cargando panel…</span></div>;
  }
  if (error) {
    return <div className="card card-pad" style={{ color: 'var(--danger)', borderColor: 'var(--danger-br)', background: 'var(--danger-bg)' }}>{error}</div>;
  }

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
        <Stat ico="📋" tint="var(--brand-050)" label="Inscripciones" value={stats?.total ?? 0} />
        <Stat ico="🧾" tint="var(--warning-bg)" label="Pre-inscriptos" value={stats?.preinscriptos ?? 0} />
        <Stat ico="⏳" tint="var(--warning-bg)" label="Pago pendiente" value={stats?.pendiente_pago ?? 0} />
        <Stat ico="✅" tint="var(--success-bg)" label="Pago completo" value={stats?.completos ?? 0} />
      </div>

      <section className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <h2>Bandeja de inscripciones</h2>
          <span className="badge">{total}</span>
        </div>

        {/* Barra de filtros */}
        <div style={filterBar}>
          <input
            className="input"
            placeholder="🔎 Buscar por nombre, DNI o teléfono…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: '2 1 240px' }}
          />
          <select className="select" value={course} onChange={(e) => setCourse(e.target.value)} style={{ flex: '1 1 200px' }}>
            <option value="">Todos los cursos</option>
            {courseNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <label style={dateWrap}>
            <span style={dateLbl}>Desde</span>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label style={dateWrap}>
            <span style={dateLbl}>Hasta</span>
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          {hayFiltros && (
            <button className="btn btn-ghost btn-sm" onClick={limpiar}>Limpiar</button>
          )}
        </div>

        <div className="table-wrap" style={{ opacity: listLoading ? 0.6 : 1, transition: 'opacity .15s' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Alumno</th>
                <th>Curso</th>
                <th>Sede</th>
                <th>Pago</th>
                <th>Curso / cupo</th>
                <th>Estado</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7}><div className="empty">
                  {hayFiltros ? 'No hay inscripciones que coincidan con la búsqueda.' : 'Sin inscripciones todavía.'}
                </div></td></tr>
              )}
              {rows.map((e) => (
                <tr key={e.id}>
                  <td><AlumnoCell e={e} /></td>
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

        {/* Paginación */}
        <div style={pager}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            {total === 0 ? 'Sin resultados' : `Mostrando ${desdeN}–${hastaN} de ${total}`}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-sm" disabled={page <= 1 || listLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Anterior</button>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Página {page} de {totalPages}</span>
            <button className="btn btn-sm" disabled={page >= totalPages || listLoading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente →</button>
          </div>
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

/** Nombre y apellido + DNI + teléfono del alumno. */
function AlumnoCell({ e }: { e: Enrollment }) {
  const nombre = e.alumno_nombre?.trim();
  return (
    <div style={{ minWidth: 150 }}>
      <div style={{ fontWeight: 600 }}>{nombre || <span style={{ color: 'var(--muted-2)' }}>(sin nombre)</span>}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        {e.alumno_dni ? `DNI ${e.alumno_dni}` : 'sin DNI'}
        {e.alumno_telefono ? ` · ${e.alumno_telefono}` : ''}
      </div>
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

const filterBar: React.CSSProperties = {
  display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
  padding: '14px 20px', borderBottom: '1px solid var(--border)',
};
const dateWrap: React.CSSProperties = { display: 'grid', gap: 4, flex: '0 0 auto' };
const dateLbl: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', fontWeight: 600 };
const pager: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  padding: '14px 20px', borderTop: '1px solid var(--border)', flexWrap: 'wrap',
};
