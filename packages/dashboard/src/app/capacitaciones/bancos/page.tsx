'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  api, auth, UnauthorizedError,
  type ExamBank, type ExamQuestion, type ExamCategory,
} from '../../../lib/api';

/**
 * Gestor de BANCOS de preguntas (solo admin). Cada banco corresponde a un tipo
 * de licencia y tiene su propio set de preguntas. Acá la escuela carga (o revisa)
 * las preguntas reales que después toman los alumnos en el examen.
 */
export default function BancosPage() {
  const router = useRouter();
  const [banks, setBanks] = useState<ExamBank[]>([]);
  const [cats, setCats] = useState<ExamCategory[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Alta de banco.
  const [categoria, setCategoria] = useState('');
  const [nombre, setNombre] = useState('');
  const [notaMinima, setNotaMinima] = useState(70);
  const [preguntasPorExamen, setPreguntasPorExamen] = useState(10);

  async function reload() {
    setBanks(await api.examBanks());
  }

  useEffect(() => {
    if (!auth.isAuthenticated()) return void router.replace('/login');
    if (!auth.isAdmin()) return void router.replace('/capacitaciones');
    (async () => {
      try {
        await reload();
        const c = await api.examCategories();
        setCats(c);
        if (c[0]) { setCategoria(c[0].key); setNombre(c[0].nombre); }
      } catch (err) {
        if (err instanceof UnauthorizedError) return router.replace('/login');
        setError('No se pudieron cargar los bancos.');
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
      await api.createBank({ categoria, nombre, notaMinima, preguntasPorExamen });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el banco');
    }
  }

  if (loading) return <p style={{ color: '#64748b' }}>Cargando…</p>;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div><Link href="/capacitaciones" style={{ color: '#2563eb', fontSize: 14 }}>← Capacitaciones</Link></div>
      <h2 style={{ margin: 0 }}>Bancos de preguntas</h2>
      {error && <div style={errorStyle}>{error}</div>}

      <section style={cardStyle}>
        <h3 style={{ margin: '0 0 12px' }}>Nuevo banco</h3>
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
            <span style={labelStyle}>Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ ...fieldStyle, flex: '0 0 120px' }}>
            <span style={labelStyle}>Nota mín. %</span>
            <input type="number" value={notaMinima} onChange={(e) => setNotaMinima(Number(e.target.value))} style={inputStyle} />
          </label>
          <label style={{ ...fieldStyle, flex: '0 0 120px' }}>
            <span style={labelStyle}>Preg./examen</span>
            <input type="number" value={preguntasPorExamen} onChange={(e) => setPreguntasPorExamen(Number(e.target.value))} style={inputStyle} />
          </label>
          <button type="submit" style={primaryBtn}>+ Crear / actualizar</button>
        </form>
      </section>

      <section>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Categoría</th><th style={th}>Nombre</th>
              <th style={th}>Preguntas</th><th style={th}>Nota mín.</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {banks.map((b) => (
              <tr key={b.id}>
                <td style={td}><strong>{b.categoria}</strong></td>
                <td style={td}>{b.nombre}</td>
                <td style={td}>{b.preguntas}</td>
                <td style={td}>{b.nota_minima}%</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => setSelected(selected === b.id ? null : b.id)} style={linkBtn}>
                    {selected === b.id ? 'Cerrar' : 'Preguntas'}
                  </button>
                </td>
              </tr>
            ))}
            {banks.length === 0 && <tr><td style={td} colSpan={5}>Sin bancos.</td></tr>}
          </tbody>
        </table>
      </section>

      {selected && <QuestionManager key={selected} bankId={selected} onCount={reload} />}
    </div>
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

const cardStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 };
const fieldStyle = { display: 'flex', flexDirection: 'column' as const, gap: 4, flex: '1 1 200px' };
const labelStyle = { fontSize: 13, color: '#475569', fontWeight: 600 };
const inputStyle = { padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, width: '100%' };
const primaryBtn = { padding: '9px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const linkBtn = { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, padding: 0 };
const errorStyle = { background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 14 };
const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, background: '#fff' };
const th = { textAlign: 'left' as const, padding: 10, borderBottom: '2px solid #e2e8f0', fontSize: 13, color: '#475569' };
const td = { padding: 10, borderBottom: '1px solid #eef2f7', fontSize: 14 };
