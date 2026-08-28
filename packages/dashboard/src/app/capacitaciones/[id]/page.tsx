'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  api, auth, UnauthorizedError,
  type TrainingCourse, type CourseStudent, type ExamSession, type Certificate,
} from '../../../lib/api';

/**
 * Detalle de una comisión: matrícula de alumnos y, por alumno, el ciclo completo
 * de evaluación — examen teórico (habilitar / validar), evaluación práctica
 * (rúbrica) y emisión del certificado.
 */

// Rúbrica práctica de ejemplo. La escuela define las maniobras reales; se dejan
// estas como placeholder para que el flujo sea demostrable.
const DEFAULT_RUBRICA = [
  'Controles previos y postura de manejo',
  'Arranque, embrague y cambios',
  'Respeto de señales y semáforos',
  'Circulación y mantenimiento del carril',
  'Estacionamiento',
  'Conducción defensiva y distancia de seguimiento',
];

export default function ComisionDetalle() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [alumnos, setAlumnos] = useState<CourseStudent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');

  const reload = useCallback(async () => {
    const { course: c, alumnos: a } = await api.trainingCourse(id);
    setCourse(c);
    setAlumnos(a);
  }, [id]);

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
        setError('No se pudo cargar la comisión.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg: string) {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 3500);
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.addStudent(id, { fullName: nombre.trim(), dni: dni.trim() });
      setNombre('');
      setDni('');
      await reload();
      flash('Alumno matriculado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo matricular al alumno');
    }
  }

  async function cerrarComision() {
    if (!window.confirm('¿Cerrar la comisión? Se marca como finalizada.')) return;
    try {
      await api.updateTrainingCourse(id, { estado: 'cerrado' });
      await reload();
      flash('Comisión cerrada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar');
    }
  }

  if (loading) return <p style={{ color: '#64748b' }}>Cargando…</p>;
  if (!course) return <p style={{ color: '#b91c1c' }}>Comisión no encontrada.</p>;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <Link href="/capacitaciones" style={{ color: '#2563eb', fontSize: 14 }}>← Capacitaciones</Link>
      </div>

      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 6px' }}>{course.nombre}</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
            {course.sede ?? 'Sin sucursal'} · Instructor: {course.instructor_email ?? '—'} ·
            Banco: {course.banco_categoria ?? 'sin examen'} · Estado: {course.estado.replace('_', ' ')}
          </p>
        </div>
        {course.estado !== 'cerrado' && (
          <button onClick={cerrarComision} style={secondaryBtn}>Cerrar comisión</button>
        )}
      </section>

      {notice && <div style={noticeStyle}>{notice}</div>}
      {error && <div style={errorStyle}>{error}</div>}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px' }}>Matricular alumno</h3>
        <form onSubmit={addStudent} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Nombre y apellido</span>
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>DNI</span>
            <input required value={dni} onChange={(e) => setDni(e.target.value)} style={inputStyle} />
          </label>
          <button type="submit" style={primaryBtn}>+ Matricular</button>
        </form>
      </section>

      <section>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Alumno</th>
              <th style={th}>DNI</th>
              <th style={th}>Código</th>
              <th style={th}>Teoría</th>
              <th style={th}>Práctica</th>
              <th style={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((a) => (
              <tr
                key={a.id}
                onClick={() => setSelected(selected === a.id ? null : a.id)}
                style={{ cursor: 'pointer', background: selected === a.id ? '#f1f5f9' : undefined }}
              >
                <td style={td}><strong>{a.full_name}</strong></td>
                <td style={td}>{a.dni}</td>
                <td style={{ ...td, fontFamily: 'monospace', letterSpacing: 1 }}>{a.codigo}</td>
                <td style={td}><TeoriaBadge estado={a.estado} /></td>
                <td style={td}><PracticaBadge value={a.practica_aprobada} /></td>
                <td style={td}><EstadoBadge estado={a.estado} /></td>
              </tr>
            ))}
            {alumnos.length === 0 && (
              <tr><td style={td} colSpan={6}>Sin alumnos matriculados.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {selected && (
        <StudentPanel
          key={selected}
          student={alumnos.find((a) => a.id === selected)!}
          onChange={reload}
          flash={flash}
          onError={(m) => setError(m)}
        />
      )}
    </div>
  );
}

// ---------------------- Panel de evaluación por alumno ----------------------

function StudentPanel({
  student, onChange, flash, onError,
}: {
  student: CourseStudent;
  onChange: () => Promise<void>;
  flash: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [cert, setCert] = useState<Certificate | null>(null);
  const [rubrica, setRubrica] = useState<{ item: string; ok: boolean }[]>(
    student.practica_rubrica ?? DEFAULT_RUBRICA.map((item) => ({ item, ok: false })),
  );
  const [busy, setBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    try { setSessions(await api.studentSessions(student.id)); } catch { /* noop */ }
    try { setCert(await api.getCertificate(student.id)); } catch { setCert(null); }
  }, [student.id]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    onError('');
    try { await fn(); } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally { setBusy(false); }
  }

  const enableExam = () => run(async () => {
    const s = await api.enableExam(student.id);
    flash(`Examen habilitado. El alumno rinde en la tablet con DNI ${student.dni} y código ${student.codigo}.`);
    setSessions((prev) => [s, ...prev]);
  });

  const validate = (sessionId: string) => run(async () => {
    await api.validateExam(sessionId);
    flash('Examen validado.');
    await loadSessions();
    await onChange();
  });

  const savePractica = () => run(async () => {
    const aprobada = rubrica.every((r) => r.ok);
    await api.setPractica(student.id, rubrica, aprobada);
    flash(aprobada ? 'Práctica aprobada.' : 'Práctica registrada (con ítems pendientes).');
    await onChange();
  });

  const issueCert = () => run(async () => {
    const c = await api.issueCertificate(student.id);
    setCert(c);
    flash(`Certificado emitido: ${c.serial}`);
    await onChange();
  });

  const puedeCertificar = student.estado === 'teoria_aprobada' && student.practica_aprobada === true;

  return (
    <section style={{ ...cardStyle, borderColor: '#cbd5e1' }}>
      <h3 style={{ margin: '0 0 4px' }}>Evaluación — {student.full_name}</h3>
      <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 13 }}>
        Código del alumno para la tablet:{' '}
        <strong style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{student.codigo}</strong>
      </p>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Examen teórico */}
        <div style={block}>
          <h4 style={blockTitle}>1 · Examen teórico</h4>
          <button onClick={enableExam} disabled={busy} style={primaryBtn}>Habilitar examen</button>
          <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0 0' }}>
            El alumno lo rinde en <Link href="/examen" style={{ color: '#2563eb' }}>modo examen</Link> (tablet)
            con su DNI + código.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 6 }}>
            {sessions.map((s) => (
              <li key={s.id} style={sessionRow}>
                <span>
                  <SessionBadge estado={s.estado} />
                  {s.puntaje !== null && <span style={{ marginLeft: 8 }}>{s.puntaje}%</span>}
                  {s.aprobado === true && <span style={{ marginLeft: 6, color: '#16a34a' }}>✓</span>}
                  {s.aprobado === false && <span style={{ marginLeft: 6, color: '#dc2626' }}>✗</span>}
                </span>
                {s.estado === 'entregado' && (
                  <button onClick={() => validate(s.id)} disabled={busy} style={miniBtn}>Validar</button>
                )}
              </li>
            ))}
            {sessions.length === 0 && <li style={{ fontSize: 13, color: '#94a3b8' }}>Sin intentos.</li>}
          </ul>
        </div>

        {/* Evaluación práctica */}
        <div style={block}>
          <h4 style={blockTitle}>2 · Evaluación práctica</h4>
          <div style={{ display: 'grid', gap: 6 }}>
            {rubrica.map((r, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox" checked={r.ok}
                  onChange={(e) => setRubrica((prev) => prev.map((x, j) => j === i ? { ...x, ok: e.target.checked } : x))}
                />
                {r.item}
              </label>
            ))}
          </div>
          <button onClick={savePractica} disabled={busy} style={{ ...primaryBtn, marginTop: 12 }}>
            Guardar práctica
          </button>
        </div>

        {/* Certificado */}
        <div style={block}>
          <h4 style={blockTitle}>3 · Certificado</h4>
          {cert ? (
            <div style={{ fontSize: 13 }}>
              <p style={{ margin: '0 0 8px' }}>
                <strong>{cert.serial}</strong>{cert.anulado && <span style={{ color: '#dc2626' }}> (anulado)</span>}
              </p>
              <a
                href={api.certificatePdfUrl(student.id)} target="_blank" rel="noreferrer"
                style={{ ...primaryBtn, background: '#d42f2f', display: 'inline-block', textDecoration: 'none' }}
              >
                Descargar PDF
              </a>
              <div style={{ marginTop: 8 }}>
                <a href={cert.verifyUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                  Ver verificación (QR) →
                </a>
              </div>
            </div>
          ) : (
            <>
              <button onClick={issueCert} disabled={busy || !puedeCertificar} style={{
                ...primaryBtn, background: puedeCertificar ? '#16a34a' : '#94a3b8',
                cursor: puedeCertificar ? 'pointer' : 'not-allowed',
              }}>
                Emitir certificado
              </button>
              {!puedeCertificar && (
                <p style={{ fontSize: 12, color: '#b45309', margin: '8px 0 0' }}>
                  Requiere teoría y práctica aprobadas.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ------------------------------- badges ------------------------------------

function TeoriaBadge({ estado }: { estado: string }) {
  if (estado === 'teoria_aprobada' || estado === 'aprobado') return <span style={chip('#dcfce7', '#166534')}>aprobada</span>;
  if (estado === 'teoria_desaprobada' || estado === 'desaprobado') return <span style={chip('#fee2e2', '#b91c1c')}>desaprobada</span>;
  return <span style={chip('#e2e8f0', '#475569')}>pendiente</span>;
}
function PracticaBadge({ value }: { value: boolean | null }) {
  if (value === true) return <span style={chip('#dcfce7', '#166534')}>aprobada</span>;
  if (value === false) return <span style={chip('#fee2e2', '#b91c1c')}>desaprobada</span>;
  return <span style={chip('#e2e8f0', '#475569')}>pendiente</span>;
}
function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, [string, string]> = {
    cursando: ['#dbeafe', '#1e40af'],
    aprobado: ['#dcfce7', '#166534'],
    desaprobado: ['#fee2e2', '#b91c1c'],
    teoria_aprobada: ['#e0e7ff', '#3730a3'],
    teoria_desaprobada: ['#ffedd5', '#9a3412'],
  };
  const [bg, fg] = map[estado] ?? ['#e2e8f0', '#334155'];
  return <span style={chip(bg, fg)}>{estado.replace('_', ' ')}</span>;
}
function SessionBadge({ estado }: { estado: string }) {
  const map: Record<string, [string, string]> = {
    habilitado: ['#fef9c3', '#854d0e'],
    en_curso: ['#dbeafe', '#1e40af'],
    entregado: ['#e0e7ff', '#3730a3'],
    validado: ['#dcfce7', '#166534'],
    anulado: ['#e2e8f0', '#475569'],
  };
  const [bg, fg] = map[estado] ?? ['#e2e8f0', '#334155'];
  return <span style={chip(bg, fg)}>{estado.replace('_', ' ')}</span>;
}

const chip = (bg: string, fg: string) => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 10,
  fontSize: 11, fontWeight: 600, background: bg, color: fg,
});
const cardStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 };
const block = { border: '1px solid #eef2f7', borderRadius: 10, padding: 16, background: '#fafbfc' };
const blockTitle = { margin: '0 0 12px', fontSize: 14, color: '#0f172a' };
const fieldStyle = { display: 'flex', flexDirection: 'column' as const, gap: 4, flex: '1 1 200px' };
const labelStyle = { fontSize: 13, color: '#475569', fontWeight: 600 };
const inputStyle = { padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, width: '100%' };
const primaryBtn = { padding: '9px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const secondaryBtn = { padding: '8px 14px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, cursor: 'pointer' };
const miniBtn = { padding: '4px 10px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' };
const sessionRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #eef2f7', borderRadius: 8, padding: '6px 10px', background: '#fff' };
const noticeStyle = { background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 14 };
const errorStyle = { background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 14 };
const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, background: '#fff' };
const th = { textAlign: 'left' as const, padding: 10, borderBottom: '2px solid #e2e8f0', fontSize: 13, color: '#475569' };
const td = { padding: 10, borderBottom: '1px solid #eef2f7', fontSize: 14 };
