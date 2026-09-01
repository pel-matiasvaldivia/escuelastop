'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  api, auth, UnauthorizedError,
  type TrainingCourse, type ExamTemplate, type AdminUser, type SucursalInfo,
} from '../../lib/api';

/**
 * Listado y alta de CURSOS (Fase 2). Cada curso es una instancia concreta de
 * capacitación, en una sucursal, con un instructor y el banco de examen que le toca.
 */
export default function CapacitacionesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [sucursales, setSucursales] = useState<SucursalInfo[]>([]);
  const [instructores, setInstructores] = useState<AdminUser[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Formulario de alta.
  const [nombre, setNombre] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [sede, setSede] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [cupo, setCupo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload() {
    const admin = auth.isAdmin();
    const role = auth.getUser()?.role;
    setIsAdmin(admin);
    setCanManage(admin || role === 'instructor');
    const [c, t, s] = await Promise.all([api.trainingCourses(), api.examTemplates(), api.sucursales()]);
    setCourses(c);
    setTemplates(t);
    setSucursales(s);
    if (!sede && s[0]) setSede(s[0].nombre);
    if (admin) {
      try { setInstructores(await api.instructores()); } catch { /* opcional */ }
    }
  }

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (err instanceof UnauthorizedError) return router.replace('/login');
        setError('No se pudieron cargar las capacitaciones.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.createTrainingCourse({
        nombre: nombre.trim(),
        templateId: templateId || undefined,
        sede: isAdmin ? (sede || undefined) : undefined,
        instructorId: instructorId || undefined,
        cupoMaximo: cupo ? Number(cupo) : null,
        fechaInicio: fechaInicio || undefined,
      });
      setNombre('');
      router.push(`/capacitaciones/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el curso');
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="empty"><span className="spinner" /> <span style={{ marginLeft: 8 }}>Cargando capacitaciones…</span></div>;
  }

  const abiertos = courses.filter((c) => c.estado === 'abierto').length;
  const enCurso = courses.filter((c) => c.estado === 'en_curso').length;
  const matriculados = courses.reduce((n, c) => n + (c.activos ?? 0), 0);

  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Fase 2</div>
          <h1>Capacitaciones</h1>
          <div className="sub">
            Cursos con evaluación teórica (examen en tablet), práctica y certificado con QR.
            {canManage && (
              <> · <Link href="/capacitaciones/bancos">Categorías y plantillas de examen →</Link></>
            )}
          </div>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cerrar' : '+ Nuevo curso'}
          </button>
        )}
      </div>

      <div className="stat-grid">
        <Stat ico="🎓" tint="var(--brand-050)" label="Cursos" value={courses.length} />
        <Stat ico="🟢" tint="var(--success-bg)" label="Abiertos" value={abiertos} />
        <Stat ico="📚" tint="var(--info-bg)" label="En curso" value={enCurso} />
        <Stat ico="👥" tint="var(--violet-bg)" label="Matriculados" value={matriculados} />
      </div>

      {error && (
        <div className="card card-pad" style={{ color: 'var(--danger)', borderColor: 'var(--danger-br)', background: 'var(--danger-bg)' }}>
          {error}
        </div>
      )}

      {canManage && showForm && (
        <section className="card fade-in">
          <div className="card-head"><h2>Nuevo curso</h2></div>
          <form onSubmit={createCourse} style={{ display: 'grid', gap: 14, padding: 20 }}>
            <div className="field">
              <span className="label">Nombre del curso</span>
              <input
                required value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: B1 — Agosto (mañana)" className="input"
              />
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '1 1 260px' }}>
                <span className="label">Plantilla de examen</span>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="select">
                  <option value="">— Sin examen teórico —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} · {t.categoria ?? '—'} ({t.preguntas_por_examen} preg. · {t.nota_minima}%)
                    </option>
                  ))}
                </select>
              </div>
              {isAdmin && (
                <div className="field" style={{ flex: '1 1 200px' }}>
                  <span className="label">Sucursal</span>
                  <select value={sede} onChange={(e) => setSede(e.target.value)} className="select">
                    {sucursales.map((s) => (<option key={s.id} value={s.nombre}>{s.nombre}</option>))}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {isAdmin && (
                <div className="field" style={{ flex: '1 1 240px' }}>
                  <span className="label">Instructor</span>
                  <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} className="select">
                    <option value="">— Sin asignar —</option>
                    {instructores.map((u) => (<option key={u.id} value={u.id}>{u.email}</option>))}
                  </select>
                </div>
              )}
              <div className="field" style={{ flex: '1 1 150px' }}>
                <span className="label">Cupo (asientos)</span>
                <input type="number" min={1} value={cupo} onChange={(e) => setCupo(e.target.value)} placeholder="Sin límite" className="input" />
              </div>
              <div className="field" style={{ flex: '1 1 150px' }}>
                <span className="label">Fecha de inicio</span>
                <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="input" />
              </div>
            </div>
            {templates.length === 0 && (
              <div className="badge badge-warning" style={{ justifyContent: 'flex-start', padding: '8px 12px', borderRadius: 10, whiteSpace: 'normal', lineHeight: 1.5 }}>
                ⚠️ Todavía no hay plantillas de examen.{' '}
                {canManage
                  ? <Link href="/capacitaciones/bancos" style={{ marginLeft: 4 }}>Creá una categoría y su plantilla →</Link>
                  : 'Pedile al instructor o admin que cree una.'}{' '}
                Podés crear el curso igual y asignarle la plantilla después.
              </div>
            )}
            <div>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? <><span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.4)' }} /> Creando…</> : '+ Crear curso'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Cursos</h2>
          <span className="badge">{courses.length}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Curso</th>
                <th>Sucursal</th>
                <th>Instructor</th>
                <th>Cupo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/capacitaciones/${c.id}`)}>
                  <td>
                    <strong>{c.nombre}</strong>
                    {c.banco_categoria && (
                      <span className="badge badge-brand" style={{ marginLeft: 8 }}>Curso {c.banco_categoria}</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-2)' }}>{c.sede ?? '—'}</td>
                  <td style={{ color: 'var(--text-2)' }}>{c.instructor_email ?? '—'}</td>
                  <td><Ocupacion activos={c.activos ?? 0} cupo={c.cupo_maximo} /></td>
                  <td><EstadoBadge estado={c.estado} /></td>
                </tr>
              ))}
              {courses.length === 0 && (
                <tr><td colSpan={5}><div className="empty">Todavía no hay cursos. Creá el primero con “+ Nuevo curso”.</div></td></tr>
              )}
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
      <div className="stat-label"><span className="stat-ico" style={{ background: tint }}>{ico}</span>{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function Ocupacion({ activos, cupo }: { activos: number; cupo: number | null }) {
  if (cupo == null) return <span style={{ color: 'var(--muted)' }}>{activos} · sin límite</span>;
  const lleno = activos >= cupo;
  return (
    <span className={`badge ${lleno ? 'badge-danger' : 'badge-success'}`}>
      {activos} / {cupo}{lleno && ' · completo'}
    </span>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const cls: Record<string, string> = {
    abierto: 'badge-success', en_curso: 'badge-info', cerrado: 'badge', cancelado: 'badge-danger',
  };
  return <span className={`badge ${cls[estado] ?? 'badge'}`}>{estado.replace('_', ' ')}</span>;
}
