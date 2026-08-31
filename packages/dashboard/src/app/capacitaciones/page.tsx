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

  // Formulario de alta.
  const [nombre, setNombre] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [sede, setSede] = useState('');
  const [instructorId, setInstructorId] = useState('');
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
        fechaInicio: fechaInicio || undefined,
      });
      setNombre('');
      router.push(`/capacitaciones/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el curso');
      setSaving(false);
    }
  }

  if (loading) return <p style={{ color: '#64748b' }}>Cargando…</p>;

  return (
    <div style={{ display: 'grid', gap: 28 }}>
      <section>
        <h2 style={{ margin: '0 0 4px' }}>Capacitaciones</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
          Cursos con evaluación teórica (examen en tablet), práctica y
          certificado con QR verificable.{' '}
          {canManage && (
            <Link href="/capacitaciones/bancos" style={{ color: '#2563eb' }}>
              Categorías y plantillas de examen →
            </Link>
          )}
        </p>
      </section>

      {error && <div style={errorStyle}>{error}</div>}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 14px' }}>Nuevo curso</h3>
        <form onSubmit={createCourse} style={{ display: 'grid', gap: 12 }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Nombre del curso</span>
            <input
              required value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: B1 — Agosto (mañana)" style={inputStyle}
            />
          </label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Plantilla de examen</span>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={inputStyle}>
                <option value="">— Sin examen teórico —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} · {t.categoria ?? '—'} ({t.preguntas_por_examen} preg. · {t.nota_minima}%)
                  </option>
                ))}
              </select>
            </label>
            {isAdmin && (
              <label style={fieldStyle}>
                <span style={labelStyle}>Sucursal</span>
                <select value={sede} onChange={(e) => setSede(e.target.value)} style={inputStyle}>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.nombre}>{s.nombre}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {isAdmin && (
              <label style={fieldStyle}>
                <span style={labelStyle}>Instructor</span>
                <select value={instructorId} onChange={(e) => setInstructorId(e.target.value)} style={inputStyle}>
                  <option value="">— Sin asignar —</option>
                  {instructores.map((u) => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
              </label>
            )}
            <label style={fieldStyle}>
              <span style={labelStyle}>Fecha de inicio</span>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={inputStyle} />
            </label>
          </div>
          {templates.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: '#b45309' }}>
              ⚠️ Todavía no hay plantillas de examen.{' '}
              {canManage
                ? <Link href="/capacitaciones/bancos" style={{ color: '#2563eb' }}>Creá una categoría y su plantilla →</Link>
                : 'Pedile al instructor o admin que cree una.'}{' '}
              Podés crear el curso igual y asignarle la plantilla después.
            </p>
          )}
          <div>
            <button type="submit" disabled={saving} style={primaryBtn}>
              {saving ? 'Creando…' : '+ Crear curso'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Curso</th>
              <th style={th}>Sucursal</th>
              <th style={th}>Instructor</th>
              <th style={th}>Alumnos</th>
              <th style={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/capacitaciones/${c.id}`)}>
                <td style={td}>
                  <strong>{c.nombre}</strong>
                  {c.banco_categoria && (
                    <span style={chip('#e0e7ff', '#3730a3')}>Curso {c.banco_categoria}</span>
                  )}
                </td>
                <td style={td}>{c.sede ?? '—'}</td>
                <td style={td}>{c.instructor_email ?? '—'}</td>
                <td style={td}>{c.alumnos ?? 0}</td>
                <td style={td}><EstadoBadge estado={c.estado} /></td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr><td style={td} colSpan={5}>Todavía no hay cursos. Creá el primero arriba.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, [string, string]> = {
    abierto: ['#dcfce7', '#166534'],
    en_curso: ['#dbeafe', '#1e40af'],
    cerrado: ['#e2e8f0', '#334155'],
    cancelado: ['#fee2e2', '#b91c1c'],
  };
  const [bg, fg] = map[estado] ?? ['#e2e8f0', '#334155'];
  return <span style={chip(bg, fg)}>{estado.replace('_', ' ')}</span>;
}

const chip = (bg: string, fg: string) => ({
  display: 'inline-block', marginLeft: 8, padding: '2px 8px', borderRadius: 10,
  fontSize: 11, fontWeight: 600, background: bg, color: fg,
});
const cardStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 };
const fieldStyle = { display: 'flex', flexDirection: 'column' as const, gap: 4, flex: '1 1 240px' };
const labelStyle = { fontSize: 13, color: '#475569', fontWeight: 600 };
const inputStyle = { padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, width: '100%' };
const primaryBtn = {
  padding: '9px 18px', background: '#0f172a', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
};
const errorStyle = { background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 14 };
const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, background: '#fff' };
const th = { textAlign: 'left' as const, padding: 10, borderBottom: '2px solid #e2e8f0', fontSize: 13, color: '#475569' };
const td = { padding: 10, borderBottom: '1px solid #eef2f7', fontSize: 14 };
