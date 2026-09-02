'use client';

import { useState } from 'react';
import { api, type ExamStart } from '../../lib/api';

/**
 * Modo EXAMEN (kiosco / tablet). El alumno ingresa con su DNI + código único, el
 * instructor debe haber habilitado el examen antes. La plataforma toma las
 * respuestas y corrige sola; el instructor valida el resultado desde el panel.
 *
 * Página pública: no requiere sesión de administración.
 */
export default function ExamenPage() {
  const [dni, setDni] = useState('');
  const [codigo, setCodigo] = useState('');
  const [exam, setExam] = useState<ExamStart | null>(null);
  const [respuestas, setRespuestas] = useState<number[]>([]);
  const [resultado, setResultado] = useState<{ puntaje: number; aprobado: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const data = await api.examStart(dni.trim(), codigo.trim());
      setExam(data);
      setRespuestas(new Array(data.preguntas.length).fill(-1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el examen');
    } finally { setBusy(false); }
  }

  async function submit() {
    if (!exam) return;
    if (respuestas.some((r) => r < 0)) {
      if (!window.confirm('Hay preguntas sin responder. ¿Entregar igual?')) return;
    }
    setBusy(true); setError(null);
    try {
      const res = await api.examSubmit(exam.sessionId, dni.trim(), codigo.trim(), respuestas.map((r) => (r < 0 ? -1 : r)));
      setResultado({ puntaje: res.puntaje, aprobado: res.aprobado });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entregar el examen');
    } finally { setBusy(false); }
  }

  // --- Resultado ---
  if (resultado) {
    return (
      <Centro>
        <div style={{ fontSize: 64, marginBottom: 12 }}>{resultado.aprobado ? '✅' : '📋'}</div>
        <h1 style={{ margin: '0 0 8px' }}>¡Examen entregado!</h1>
        <p style={{ fontSize: 18, color: '#475569', margin: 0 }}>
          Puntaje: <strong>{resultado.puntaje}%</strong>
        </p>
        <p style={{ color: '#64748b', maxWidth: 420, marginTop: 12 }}>
          El instructor va a validar tu examen. Podés devolverle la tablet.
        </p>
      </Centro>
    );
  }

  // --- Examen en curso ---
  if (exam) {
    const contestadas = respuestas.filter((r) => r >= 0).length;
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '8px 16px 60px' }}>
        <div style={{ position: 'sticky', top: 'var(--header-h)', zIndex: 10, background: 'var(--bg)', padding: '16px 0', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 4px' }}>{exam.curso ?? 'Examen'}</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
            {exam.alumno} · {contestadas}/{exam.preguntas.length} respondidas
            {exam.tiempoLimiteMin && ` · ${exam.tiempoLimiteMin} min sugeridos`}
          </p>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={{ display: 'grid', gap: 18 }}>
          {exam.preguntas.map((q, qi) => (
            <div key={q.id} className="card" style={{ padding: 18 }}>
              <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{qi + 1}. {q.enunciado}</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {q.opciones.map((o, oi) => {
                  const sel = respuestas[qi] === oi;
                  return (
                    <label key={oi} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                      border: `2px solid ${sel ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 10,
                      background: sel ? 'var(--brand-050)' : 'var(--surface)', cursor: 'pointer', fontSize: 15,
                    }}>
                      <input
                        type="radio" name={`q${qi}`} checked={sel}
                        onChange={() => setRespuestas((prev) => prev.map((r, j) => j === qi ? oi : r))}
                      />
                      {o}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button onClick={submit} disabled={busy} style={{ ...bigBtn, marginTop: 24, width: '100%' }}>
          {busy ? 'Entregando…' : 'Entregar examen'}
        </button>
      </div>
    );
  }

  // --- Ingreso con DNI + código ---
  return (
    <Centro>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🚗</div>
      <h1 style={{ margin: '0 0 4px' }}>Examen — Escuela STOP</h1>
      <p style={{ color: '#64748b', margin: '0 0 24px' }}>Ingresá tu DNI y el código que te dio el instructor.</p>
      <form onSubmit={start} style={{ display: 'grid', gap: 14, width: 300 }}>
        <input value={dni} onChange={(e) => setDni(e.target.value)} placeholder="DNI" required style={bigInput} inputMode="numeric" />
        <input
          value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="Código" required style={{ ...bigInput, fontFamily: 'monospace', letterSpacing: 2 }}
        />
        {error && <div style={errorStyle}>{error}</div>}
        <button type="submit" disabled={busy} style={bigBtn}>{busy ? 'Verificando…' : 'Comenzar'}</button>
      </form>
    </Centro>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      {children}
    </div>
  );
}

const bigInput = { padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border-strong)', fontSize: 18, textAlign: 'center' as const, fontFamily: 'inherit', color: 'var(--text)' };
const bigBtn = { padding: '14px 20px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const errorStyle = { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-br)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 14 };
