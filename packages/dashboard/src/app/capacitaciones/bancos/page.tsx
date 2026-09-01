'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  api, auth, UnauthorizedError,
  type ExamBank, type ExamQuestion, type ExamCategory, type ExamTemplate,
} from '../../../lib/api';

/**
 * Gestor de CATEGORÍAS de preguntas y PLANTILLAS de examen (instructor o admin).
 * Una categoría es el pool de preguntas de un tipo de licencia; una plantilla
 * toma una categoría y fija los parámetros del examen (cantidad, nota, tiempo).
 */
export default function BancosPage() {
  const router = useRouter();
  const [banks, setBanks] = useState<ExamBank[]>([]);
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [cats, setCats] = useState<ExamCategory[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Alta de categoría (banco).
  const [categoria, setCategoria] = useState('');
  const [nombre, setNombre] = useState('');

  async function reload() {
    const [b, t] = await Promise.all([api.examBanks(), api.examTemplates()]);
    setBanks(b);
    setTemplates(t);
  }

  useEffect(() => {
    if (!auth.isAuthenticated()) return void router.replace('/login');
    const role = auth.getUser()?.role;
    if (role !== 'admin' && role !== 'instructor') return void router.replace('/capacitaciones');
    (async () => {
      try {
        await reload();
        const c = await api.examCategories();
        setCats(c);
        if (c[0]) { setCategoria(c[0].key); setNombre(c[0].nombre); }
      } catch (err) {
        if (err instanceof UnauthorizedError) return router.replace('/login');
        setError('No se pudieron cargar las categorías.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createBank(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createBank({ categoria, nombre });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría');
    }
  }

  if (loading) return <div className="empty"><span className="spinner" /> <span style={{ marginLeft: 8 }}>Cargando…</span></div>;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div><Link href="/capacitaciones">← Capacitaciones</Link></div>
      <div>
        <div className="eyebrow">Fase 2</div>
        <h1>Categorías y plantillas de examen</h1>
        <div className="sub">Bancos de preguntas por tipo de licencia y plantillas que definen cómo se arma cada examen.</div>
      </div>
      {error && <div style={errorStyle}>{error}</div>}

      <TemplatesSection banks={banks} templates={templates} onChange={reload} />

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 4px' }}>Categorías de preguntas</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
          Una categoría agrupa las preguntas de un tipo de licencia. Cargá las preguntas
          (manual o por Excel/CSV) y después armá una plantilla que las use.
        </p>
        <h4 style={{ margin: '0 0 10px' }}>Nueva categoría</h4>
        <form onSubmit={createBank} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Categoría</span>
            <select
              value={categoria}
              onChange={(e) => {
                setCategoria(e.target.value);
                const c = cats.find((x) => x.key === e.target.value);
                if (c) setNombre(c.nombre);
              }}
              style={inputStyle}
            >
              {cats.map((c) => <option key={c.key} value={c.key}>{c.key} — {c.nombre}</option>)}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Nombre visible</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} />
          </label>
          <button type="submit" style={primaryBtn}>+ Crear / actualizar</button>
        </form>

        <table style={{ ...tableStyle, marginTop: 16 }}>
          <thead>
            <tr>
              <th style={th}>Categoría</th><th style={th}>Nombre</th>
              <th style={th}>Preguntas</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {banks.map((b) => (
              <tr key={b.id}>
                <td style={td}><strong>{b.categoria}</strong></td>
                <td style={td}>{b.nombre}</td>
                <td style={td}>{b.preguntas}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => setSelected(selected === b.id ? null : b.id)} style={linkBtn}>
                    {selected === b.id ? 'Cerrar' : 'Preguntas'}
                  </button>
                </td>
              </tr>
            ))}
            {banks.length === 0 && <tr><td style={td} colSpan={4}>Sin categorías todavía.</td></tr>}
          </tbody>
        </table>
      </section>

      {selected && <QuestionManager key={selected} bankId={selected} onCount={reload} />}
    </div>
  );
}

/** Sección de plantillas de examen: crear (elige categoría + parámetros) y listar. */
function TemplatesSection({
  banks, templates, onChange,
}: {
  banks: ExamBank[];
  templates: ExamTemplate[];
  onChange: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState('');
  const [bankId, setBankId] = useState('');
  const [preguntasPorExamen, setPreguntas] = useState(10);
  const [notaMinima, setNota] = useState(70);
  const [tiempoLimiteMin, setTiempo] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bankId && banks[0]) setBankId(banks[0].id);
  }, [banks, bankId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bankId) { setError('Primero creá una categoría de preguntas.'); return; }
    try {
      await api.createTemplate({ nombre: nombre.trim(), bankId, preguntasPorExamen, notaMinima, tiempoLimiteMin });
      setNombre('');
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la plantilla');
    }
  }

  async function remove(id: string) {
    if (!window.confirm('¿Eliminar la plantilla? Los cursos que la usaban quedan sin examen asignado.')) return;
    await api.deleteTemplate(id);
    await onChange();
  }

  return (
    <section style={cardStyle}>
      <h3 style={{ margin: '0 0 4px' }}>Plantillas de examen</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
        Una plantilla toma una categoría de preguntas y define cómo se arma el examen.
        El curso elige una plantilla.
      </p>
      {error && <div style={{ ...errorStyle, marginBottom: 12 }}>{error}</div>}

      <form onSubmit={create} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ ...fieldStyle, flex: '1 1 220px' }}>
          <span style={labelStyle}>Nombre de la plantilla</span>
          <input required value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: B1 — examen final" style={inputStyle} />
        </label>
        <label style={{ ...fieldStyle, flex: '1 1 220px' }}>
          <span style={labelStyle}>Categoría de preguntas</span>
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} style={inputStyle}>
            {banks.length === 0 && <option value="">— Creá una categoría primero —</option>}
            {banks.map((b) => <option key={b.id} value={b.id}>{b.categoria} · {b.nombre} ({b.preguntas} preg.)</option>)}
          </select>
        </label>
        <label style={{ ...fieldStyle, flex: '0 0 110px' }}>
          <span style={labelStyle}>Preg./examen</span>
          <input type="number" min={1} value={preguntasPorExamen} onChange={(e) => setPreguntas(Number(e.target.value))} style={inputStyle} />
        </label>
        <label style={{ ...fieldStyle, flex: '0 0 100px' }}>
          <span style={labelStyle}>Nota mín. %</span>
          <input type="number" min={0} max={100} value={notaMinima} onChange={(e) => setNota(Number(e.target.value))} style={inputStyle} />
        </label>
        <label style={{ ...fieldStyle, flex: '0 0 100px' }}>
          <span style={labelStyle}>Tiempo (min)</span>
          <input type="number" min={1} value={tiempoLimiteMin} onChange={(e) => setTiempo(Number(e.target.value))} style={inputStyle} />
        </label>
        <button type="submit" style={primaryBtn}>+ Crear plantilla</button>
      </form>

      <table style={{ ...tableStyle, marginTop: 16 }}>
        <thead>
          <tr>
            <th style={th}>Plantilla</th><th style={th}>Categoría</th>
            <th style={th}>Preg.</th><th style={th}>Nota</th><th style={th}>Tiempo</th><th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id}>
              <td style={td}><strong>{t.nombre}</strong></td>
              <td style={td}>{t.categoria ?? '—'}</td>
              <td style={td}>{t.preguntas_por_examen}</td>
              <td style={td}>{t.nota_minima}%</td>
              <td style={td}>{t.tiempo_limite_min}′</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button onClick={() => remove(t.id)} style={{ ...linkBtn, color: '#dc2626' }}>Eliminar</button>
              </td>
            </tr>
          ))}
          {templates.length === 0 && <tr><td style={td} colSpan={6}>Sin plantillas todavía.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

/** Parser CSV mínimo (RFC 4180): soporta comillas y comas dentro de campos. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

type ParsedQ = { enunciado: string; opciones: string[]; correcta: number };

/**
 * Interpreta las filas del CSV. Formato: enunciado, opción 1, opción 2, … ,
 * correcta (número 1-based de la opción correcta, en la última columna). La
 * primera fila se descarta si parece encabezado (última celda no numérica).
 */
function rowsToQuestions(rows: string[][]): { ok: ParsedQ[]; errores: string[] } {
  const ok: ParsedQ[] = [];
  const errores: string[] = [];
  rows.forEach((r, idx) => {
    const cells = r.map((c) => c.trim());
    const last = cells[cells.length - 1];
    // Encabezado: primera fila con última celda no numérica.
    if (idx === 0 && !/^\d+$/.test(last)) return;
    const enunciado = cells[0] ?? '';
    const correcta1 = Number(last);
    const opciones = cells.slice(1, -1).filter(Boolean);
    if (!enunciado || opciones.length < 2 || !Number.isInteger(correcta1)) {
      errores.push(`Fila ${idx + 1}: revisá enunciado, opciones (mín. 2) y nº de correcta`);
      return;
    }
    if (correcta1 < 1 || correcta1 > opciones.length) {
      errores.push(`Fila ${idx + 1}: la correcta (${correcta1}) está fuera de rango`);
      return;
    }
    ok.push({ enunciado, opciones, correcta: correcta1 - 1 });
  });
  return { ok, errores };
}

const CSV_TEMPLATE =
  'enunciado,opcion 1,opcion 2,opcion 3,opcion 4,correcta\n' +
  '"¿Qué indica una línea amarilla continua?","Se puede adelantar","Prohibido cruzarla","Zona de estacionamiento","Carril de colectivos",2\n';

function QuestionManager({ bankId, onCount }: { bankId: string; onCount: () => Promise<void> }) {
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [enunciado, setEnunciado] = useState('');
  const [opciones, setOpciones] = useState(['', '', '', '']);
  const [correcta, setCorrecta] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Importación por CSV.
  const [preview, setPreview] = useState<ParsedQ[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  async function reload() {
    setQuestions(await api.bankQuestions(bankId));
  }
  useEffect(() => { void reload(); }, [bankId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { ok, errores } = rowsToQuestions(parseCsv(String(reader.result ?? '')));
      setPreview(ok);
      setImportErrors(errores);
      setError(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function doImport() {
    if (preview.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const { importadas } = await api.importQuestions(bankId, preview);
      setPreview([]);
      setImportErrors([]);
      await reload();
      await onCount();
      setError(null);
      alert(`✅ ${importadas} preguntas importadas.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron importar');
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-preguntas.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ops = opciones.map((o) => o.trim()).filter(Boolean);
    if (!enunciado.trim() || ops.length < 2) { setError('Enunciado y al menos 2 opciones.'); return; }
    if (correcta >= ops.length) { setError('La opción correcta no existe.'); return; }
    try {
      await api.addQuestion(bankId, { enunciado: enunciado.trim(), opciones: ops, correcta });
      setEnunciado(''); setOpciones(['', '', '', '']); setCorrecta(0);
      await reload();
      await onCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar');
    }
  }

  async function del(id: string) {
    await api.deleteQuestion(id);
    await reload();
    await onCount();
  }

  return (
    <section style={{ ...cardStyle, borderColor: '#cbd5e1' }}>
      <h3 style={{ margin: '0 0 12px' }}>Preguntas del banco ({questions.length})</h3>
      {error && <div style={{ ...errorStyle, marginBottom: 12 }}>{error}</div>}

      {/* Importación masiva desde Excel/CSV */}
      <div style={{ border: '1px dashed #cbd5e1', borderRadius: 10, padding: 14, marginBottom: 18, background: '#f8fafc' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Importar desde Excel / CSV</strong>
          <button type="button" onClick={downloadTemplate} style={linkBtn}>Descargar plantilla</button>
          <label style={{ ...primaryBtn, display: 'inline-block' }}>
            Elegir archivo CSV
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </label>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
          Desde Excel: <em>Archivo → Guardar como → CSV</em>. Columnas: <code>enunciado</code>,
          una columna por opción, y la última columna con el <strong>número de la opción
          correcta</strong> (1, 2, 3…). La primera fila puede ser el encabezado.
        </p>

        {importErrors.length > 0 && (
          <div style={{ ...errorStyle, marginTop: 10 }}>
            {importErrors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
            {importErrors.length > 5 && <div>…y {importErrors.length - 5} más.</div>}
          </div>
        )}

        {preview.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#166534' }}>
              {preview.length} preguntas listas para importar. Vista previa:
            </p>
            <ol style={{ margin: 0, paddingLeft: 18, maxHeight: 180, overflow: 'auto', fontSize: 13 }}>
              {preview.slice(0, 8).map((q, i) => (
                <li key={i}>{q.enunciado} <span style={{ color: '#16a34a' }}>→ {q.opciones[q.correcta]}</span></li>
              ))}
            </ol>
            <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
              <button type="button" onClick={doImport} disabled={importing} style={{ ...primaryBtn, background: '#16a34a' }}>
                {importing ? 'Importando…' : `Importar ${preview.length} preguntas`}
              </button>
              <button type="button" onClick={() => { setPreview([]); setImportErrors([]); }} style={linkBtn}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={add} style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
        <input value={enunciado} onChange={(e) => setEnunciado(e.target.value)} placeholder="Enunciado de la pregunta" style={inputStyle} />
        {opciones.map((o, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="radio" name="correcta" checked={correcta === i} onChange={() => setCorrecta(i)} title="Marcar como correcta" />
            <input
              value={o}
              onChange={(e) => setOpciones((prev) => prev.map((x, j) => j === i ? e.target.value : x))}
              placeholder={`Opción ${i + 1}${correcta === i ? ' (correcta)' : ''}`}
              style={{ ...inputStyle, borderColor: correcta === i ? '#16a34a' : '#cbd5e1' }}
            />
          </div>
        ))}
        <div><button type="submit" style={primaryBtn}>+ Agregar pregunta</button></div>
      </form>

      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 10 }}>
        {questions.map((q) => (
          <li key={q.id} style={{ fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{q.enunciado}</strong>
              <button onClick={() => del(q.id)} style={{ ...linkBtn, color: '#dc2626' }}>Eliminar</button>
            </div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#475569' }}>
              {q.opciones.map((o, i) => (
                <li key={i} style={{ color: i === q.correcta ? '#16a34a' : '#64748b' }}>
                  {o}{i === q.correcta && ' ✓'}
                </li>
              ))}
            </ul>
          </li>
        ))}
        {questions.length === 0 && <li style={{ color: '#94a3b8' }}>Sin preguntas todavía.</li>}
      </ol>
    </section>
  );
}

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, boxShadow: 'var(--shadow-sm)' };
const fieldStyle = { display: 'flex', flexDirection: 'column' as const, gap: 6, flex: '1 1 200px' };
const labelStyle = { fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 };
const inputStyle = { padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', fontSize: 14, width: '100%', fontFamily: 'inherit', color: 'var(--text)' };
const primaryBtn = { padding: '10px 16px', background: 'var(--brand)', color: '#fff', border: '1px solid var(--brand)', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const linkBtn = { background: 'none', border: 'none', color: 'var(--brand-600)', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit', fontWeight: 600 };
const errorStyle = { background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-br)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 14 };
const tableStyle = { width: '100%', borderCollapse: 'separate' as const, borderSpacing: 0, background: 'var(--surface)', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' };
const th = { textAlign: 'left' as const, padding: '11px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: 'var(--muted)' };
const td = { padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 };
