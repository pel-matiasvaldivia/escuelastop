'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  api, auth, UnauthorizedError,
  type TrainingCourse, type CourseStudent, type ExamSession, type Certificate,
  type CourseClass, type AttendanceRecord, type AttendanceSummary,
} from '../../../lib/api';

/**
 * Detalle de un curso: matrícula de alumnos y, por alumno, el ciclo completo
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

export default function CursoDetalle() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [alumnos, setAlumnos] = useState<CourseStudent[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
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
    try { setSummary(await api.attendanceSummary(id)); } catch { /* opcional */ }
  }, [id]);

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace('/login');
      return;
    }
    setIsAdmin(auth.isAdmin());
    (async () => {
      try {
        await reload();
      } catch (err) {
        if (err instanceof UnauthorizedError) return router.replace('/login');
        setError('No se pudo cargar el curso.');
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

  async function cerrarCurso() {
    if (!window.confirm('¿Cerrar el curso? Se marca como finalizado.')) return;
    try {
      await api.updateTrainingCourse(id, { estado: 'cerrado' });
      await reload();
      flash('Curso cerrado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar');
    }
  }

  async function editarCupo() {
    const actual = course?.cupo_maximo != null ? String(course.cupo_maximo) : '';
    const val = window.prompt('Cupo de asientos (dejalo vacío para "sin límite"):', actual);
    if (val === null) return; // canceló
    const n = val.trim() === '' ? null : Number(val);
    if (n !== null && (!Number.isFinite(n) || n < 1)) {
      setError('El cupo debe ser un número mayor a 0, o vacío para sin límite.');
      return;
    }
    try {
      await api.updateTrainingCourse(id, { cupo_maximo: n });
      await reload();
      flash(n === null ? 'Cupo actualizado: sin límite.' : `Cupo actualizado: ${n} asientos.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el cupo');
    }
  }

  if (loading) return <p style={{ color: '#64748b' }}>Cargando…</p>;
  if (!course) return <p style={{ color: '#b91c1c' }}>Curso no encontrado.</p>;

  const activos = alumnos.filter((a) => a.estado !== 'baja').length;
  const cupoLleno = course.cupo_maximo != null && activos >= course.cupo_maximo;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div>
        <Link href="/capacitaciones" style={{ color: '#2563eb', fontSize: 14 }}>← Capacitaciones</Link>
      </div>

      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 6px' }}>
            {course.nombre}
            {course.banco_categoria && (
              <span style={{
                marginLeft: 10, padding: '3px 10px', borderRadius: 10, fontSize: 13,
                fontWeight: 600, background: '#e0e7ff', color: '#3730a3', verticalAlign: 'middle',
              }}>
                Curso {course.banco_categoria}
              </span>
            )}
          </h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
            {course.sede ?? 'Sin sucursal'} · Instructor: {course.instructor_email ?? '—'} ·
            Examen: {course.plantilla_nombre ?? course.banco_categoria ?? 'sin examen'} ·
            Estado: {course.estado.replace('_', ' ')}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 14 }}>
            <span style={{ fontWeight: 600, color: cupoLleno ? '#b91c1c' : '#0f172a' }}>
              Asientos: {activos}{course.cupo_maximo != null ? ` / ${course.cupo_maximo}` : ' (sin límite)'}
              {cupoLleno && ' · completo'}
            </span>
            <button onClick={editarCupo} style={{ ...linkBtn, marginLeft: 10 }}>Editar cupo</button>
          </p>
        </div>
        {course.estado !== 'cerrado' && (
          <button onClick={cerrarCurso} style={secondaryBtn}>Cerrar curso</button>
        )}
      </section>

      {notice && <div style={noticeStyle}>{notice}</div>}
      {error && <div style={errorStyle}>{error}</div>}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px' }}>Matricular alumno</h3>
        {cupoLleno && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#b45309' }}>
            ⚠️ El curso alcanzó su cupo ({course.cupo_maximo} asientos). Para sumar a alguien,
            ampliá el cupo (“Editar cupo”) o dá de baja a un alumno.
          </p>
        )}
        <form onSubmit={addStudent} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Nombre y apellido</span>
            <input required value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>DNI</span>
            <input required value={dni} onChange={(e) => setDni(e.target.value)} style={inputStyle} />
          </label>
          <button type="submit" disabled={cupoLleno} style={{
            ...primaryBtn, ...(cupoLleno ? { background: '#94a3b8', cursor: 'not-allowed' } : {}),
          }}>+ Matricular</button>
        </form>
      </section>

      <section>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Alumno</th>
              <th style={th}>DNI</th>
              <th style={th}>Código</th>
              <th style={th}>Asistencia</th>
              <th style={th}>Teoría</th>
              <th style={th}>Práctica</th>
              <th style={th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((a) => {
              const s = summary.find((x) => x.course_student_id === a.id);
              const baja = a.estado === 'baja';
              return (
                <tr
                  key={a.id}
                  onClick={() => setSelected(selected === a.id ? null : a.id)}
                  style={{
                    cursor: 'pointer',
                    background: selected === a.id ? '#f1f5f9' : undefined,
                    opacity: baja ? 0.55 : 1,
                  }}
                >
                  <td style={td}><strong>{a.full_name}</strong></td>
                  <td style={td}>{a.dni}</td>
                  <td style={{ ...td, fontFamily: 'monospace', letterSpacing: 1 }}>{a.codigo}</td>
                  <td style={td}>
                    {s ? <span style={{ fontSize: 13 }}>
                      <span style={{ color: '#166534' }}>{s.presentes}P</span>{' / '}
                      <span style={{ color: '#b91c1c' }}>{s.ausentes}A</span>
                    </span> : <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>}
                  </td>
                  <td style={td}><TeoriaBadge estado={a.estado} /></td>
                  <td style={td}><PracticaBadge value={a.practica_aprobada} /></td>
                  <td style={td}><EstadoBadge estado={a.estado} /></td>
                </tr>
              );
            })}
            {alumnos.length === 0 && (
              <tr><td style={td} colSpan={7}>Sin alumnos matriculados.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {selected && (
        <StudentPanel
          key={selected}
          student={alumnos.find((a) => a.id === selected)!}
          isAdmin={isAdmin}
          onChange={reload}
          flash={flash}
          onError={(m) => setError(m)}
        />
      )}

      <AttendanceSection
        courseId={id}
        alumnos={alumnos.filter((a) => a.estado !== 'baja')}
        onChange={reload}
        flash={flash}
        onError={(m) => setError(m)}
      />
    </div>
  );
}

// ---------------------- Panel de evaluación por alumno ----------------------

function StudentPanel({
  student, isAdmin, onChange, flash, onError,
}: {
  student: CourseStudent;
  isAdmin: boolean;
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

  const darBaja = () => run(async () => {
    const motivo = window.prompt('Motivo de la baja (opcional): abandono, cambió de sede, etc.') ?? undefined;
    await api.bajaStudent(student.id, motivo);
    flash('Alumno dado de baja. Conserva su historial y se liberó el asiento.');
    await onChange();
  });

  const reactivar = () => run(async () => {
    await api.reactivarStudent(student.id);
    flash('Alumno reactivado.');
    await onChange();
  });

  const eliminar = () => run(async () => {
    if (!window.confirm(
      '¿Eliminar DEFINITIVAMENTE al alumno? Se borra también su historial (exámenes, certificados, asistencia). Esta acción no se puede deshacer.',
    )) return;
    await api.removeStudent(student.id);
    flash('Alumno eliminado.');
    await onChange();
  });

  const puedeCertificar = student.estado === 'teoria_aprobada' && student.practica_aprobada === true;
  const dadoDeBaja = student.estado === 'baja';

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

      {/* Baja / reactivación / borrado */}
      <div style={{
        marginTop: 20, paddingTop: 16, borderTop: '1px solid #eef2f7',
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {dadoDeBaja ? (
          <>
            <span style={{ fontSize: 13, color: '#b91c1c' }}>
              Dado de baja{student.baja_motivo ? `: ${student.baja_motivo}` : ''}.
            </span>
            <button onClick={reactivar} disabled={busy} style={secondaryBtn}>Reactivar</button>
          </>
        ) : (
          <button onClick={darBaja} disabled={busy} style={secondaryBtn}>Dar de baja</button>
        )}
        {isAdmin && (
          <button onClick={eliminar} disabled={busy} style={{
            ...secondaryBtn, color: '#b91c1c', borderColor: '#fecaca', marginLeft: 'auto',
          }}>
            Eliminar definitivamente
          </button>
        )}
      </div>
    </section>
  );
}

// --------------------------- Asistencia (clases) ---------------------------

function AttendanceSection({
  courseId, alumnos, onChange, flash, onError,
}: {
  courseId: string;
  alumnos: CourseStudent[];
  onChange: () => Promise<void>;
  flash: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [classes, setClasses] = useState<CourseClass[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [records, setRecords] = useState<Record<string, boolean>>({});
  const [fecha, setFecha] = useState('');
  const [tema, setTema] = useState('');
  const [busy, setBusy] = useState(false);

  const loadClasses = useCallback(async () => {
    try { setClasses(await api.courseClasses(courseId)); } catch { /* noop */ }
  }, [courseId]);

  useEffect(() => { void loadClasses(); }, [loadClasses]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    onError('');
    try { await fn(); } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally { setBusy(false); }
  }

  const addClass = (e: React.FormEvent) => {
    e.preventDefault();
    return run(async () => {
      if (!fecha) return;
      await api.createClass(courseId, { fecha, tema: tema.trim() || undefined });
      setFecha(''); setTema('');
      await loadClasses();
      flash('Clase agregada.');
    });
  };

  const openClass = (id: string) => run(async () => {
    if (openId === id) { setOpenId(null); return; }
    const att = await api.classAttendance(id);
    // Por defecto todos presentes; pisamos con lo guardado.
    const map: Record<string, boolean> = {};
    for (const a of alumnos) map[a.id] = true;
    for (const r of att) map[r.course_student_id] = r.presente;
    setRecords(map);
    setOpenId(id);
  });

  const saveAttendance = (id: string) => run(async () => {
    const payload = alumnos.map((a) => ({ studentId: a.id, presente: records[a.id] !== false }));
    await api.saveAttendance(id, payload);
    flash('Asistencia guardada.');
    await loadClasses();
    await onChange(); // refresca el resumen de la tabla de alumnos
  });

  const removeClass = (id: string) => run(async () => {
    if (!window.confirm('¿Eliminar la clase y su asistencia?')) return;
    await api.deleteClass(id);
    if (openId === id) setOpenId(null);
    await loadClasses();
    flash('Clase eliminada.');
  });

  return (
    <section style={cardStyle}>
      <h3 style={{ margin: '0 0 4px' }}>Asistencia</h3>
      <p style={{ margin: '0 0 14px', color: '#64748b', fontSize: 13 }}>
        Registrá las clases dictadas y marcá quién asistió. El resumen (presentes/ausentes)
        aparece en la columna “Asistencia” de cada alumno.
      </p>

      <form onSubmit={addClass} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Fecha de la clase</span>
          <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ ...fieldStyle, flex: '2 1 260px' }}>
          <span style={labelStyle}>Tema (opcional)</span>
          <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ej: Señales de tránsito" style={inputStyle} />
        </label>
        <button type="submit" disabled={busy} style={primaryBtn}>+ Agregar clase</button>
      </form>

      {classes.length === 0 ? (
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Todavía no hay clases registradas.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {classes.map((c) => (
            <li key={c.id} style={{ border: '1px solid #eef2f7', borderRadius: 10, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                <button onClick={() => openClass(c.id)} disabled={busy} style={{ ...linkBtn, fontWeight: 600 }}>
                  {new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-AR')}
                  {c.tema ? ` · ${c.tema}` : ''}
                </button>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  <span style={{ color: '#166534' }}>{c.presentes}P</span>{' / '}
                  <span style={{ color: '#b91c1c' }}>{c.ausentes}A</span>
                </span>
                <button onClick={() => removeClass(c.id)} disabled={busy} style={{ ...linkBtn, color: '#b91c1c', marginLeft: 'auto' }}>
                  Eliminar
                </button>
              </div>

              {openId === c.id && (
                <div style={{ padding: '4px 14px 14px', borderTop: '1px solid #f1f5f9' }}>
                  {alumnos.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#94a3b8' }}>No hay alumnos activos.</p>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gap: 6, margin: '10px 0' }}>
                        {alumnos.map((a) => (
                          <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                            <input
                              type="checkbox"
                              checked={records[a.id] !== false}
                              onChange={(e) => setRecords((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                            />
                            {a.full_name} <span style={{ color: '#94a3b8', fontSize: 12 }}>({a.dni})</span>
                          </label>
                        ))}
                      </div>
                      <button onClick={() => saveAttendance(c.id)} disabled={busy} style={primaryBtn}>
                        Guardar asistencia
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
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
    baja: ['#fee2e2', '#b91c1c'],
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
const linkBtn = { background: 'none', border: 'none', padding: 0, color: '#2563eb', fontSize: 14, cursor: 'pointer', textAlign: 'left' as const };
const miniBtn = { padding: '4px 10px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' };
const sessionRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #eef2f7', borderRadius: 8, padding: '6px 10px', background: '#fff' };
const noticeStyle = { background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 14 };
const errorStyle = { background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 14 };
const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, background: '#fff' };
const th = { textAlign: 'left' as const, padding: 10, borderBottom: '2px solid #e2e8f0', fontSize: 13, color: '#475569' };
const td = { padding: 10, borderBottom: '1px solid #eef2f7', fontSize: 14 };
