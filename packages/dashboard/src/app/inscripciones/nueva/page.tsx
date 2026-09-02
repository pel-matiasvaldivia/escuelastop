'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  api, auth, UnauthorizedError, type Course, type SucursalInfo,
} from '../../../lib/api';

/**
 * Alta manual de una inscripción: para quien llamó por teléfono o vino a la
 * sucursal y no pasó por WhatsApp. Al guardar se genera el link del formulario
 * para que el alumno complete sus datos y suba la documentación.
 */
export default function NuevaInscripcionPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [sucursales, setSucursales] = useState<SucursalInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ formUrl: string; contactId: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // El operador solo carga inscripciones para su propia sucursal (fija).
  const currentUser = auth.getUser();
  const lockedSede = currentUser?.role === 'operador' ? (currentUser.sucursal ?? '') : null;

  const [form, setForm] = useState({
    fullName: '', phone: '', email: '', dni: '', age: '',
    courseId: '', sede: lockedSede ?? '', notes: '', senaCobrada: false,
  });

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace('/login');
      return;
    }
    api.catalog().then(setCourses).catch(() => setCourses([]));
    api.sucursales().then(setSucursales).catch(() => setSucursales([]));
  }, [router]);

  const selected = courses.find((c) => c.id === form.courseId);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.createManualEnrollment({
        fullName: form.fullName,
        phone: form.phone,
        email: form.email || undefined,
        dni: form.dni || undefined,
        age: form.age ? Number(form.age) : undefined,
        courseId: form.courseId || undefined,
        sede: form.sede || undefined,
        notes: form.notes || undefined,
        senaCobrada: form.senaCobrada,
      });
      // El link se arma con el origen del propio panel: el formulario vive acá
      // mismo. Así no depende de FORM_BASE_URL, que si está mal configurada en
      // el backend devuelve un localhost inservible para el alumno.
      const token = res.enrollment.form_token;
      const formUrl = token
        ? `${window.location.origin}/inscripcion/${token}`
        : res.formUrl;
      setResult({ formUrl, contactId: res.contact.id });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.replace('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Error al crear la inscripción');
    } finally {
      setBusy(false);
    }
  }

  // --- Confirmación con el link del formulario ---
  if (result) {
    return (
      <div style={{ maxWidth: 620 }}>
        <h1 style={{ marginTop: 0 }}>✅ Inscripción creada</h1>
        <p style={{ color: 'var(--text-2)' }}>
          Pasale este link al alumno para que complete sus datos y suba la
          documentación (DNI, licencia):
        </p>
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 16,
        }}>
          <code style={{ flex: 1, fontSize: 13, wordBreak: 'break-all' }}>
            {result.formUrl}
          </code>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(result.formUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            style={{ ...primaryBtn, padding: '8px 14px', fontSize: 13 }}
          >
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href={`/contactos/${result.contactId}`} style={{ ...primaryBtn, textDecoration: 'none' }}>
            Ver ficha del alumno
          </Link>
          <button
            onClick={() => {
              setResult(null);
              setForm({
                fullName: '', phone: '', email: '', dni: '', age: '',
                courseId: '', sede: '', notes: '', senaCobrada: false,
              });
            }}
            style={secondaryBtn}
          >
            Cargar otra
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <Link href="/">← Volver</Link>
      <h1 style={{ margin: '10px 0 4px' }}>Nueva inscripción</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Para alumnos que se contactaron por teléfono o vinieron a la sucursal.
      </p>

      <form onSubmit={onSubmit} className="card" style={{
        padding: 24, display: 'grid', gap: 14,
      }}>
        <Field label="Nombre y apellido *">
          <input required value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)} style={input} />
        </Field>

        <Field label="Teléfono *" hint="Con característica, ej: 261 123-4567">
          <input required value={form.phone}
            onChange={(e) => set('phone', e.target.value)} style={input} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="DNI">
            <input value={form.dni} onChange={(e) => set('dni', e.target.value)} style={input} />
          </Field>
          <Field label="Edad">
            <input type="number" min={16} max={99} value={form.age}
              onChange={(e) => set('age', e.target.value)} style={input} />
          </Field>
        </div>

        <Field label="Email">
          <input type="email" value={form.email}
            onChange={(e) => set('email', e.target.value)} style={input} />
        </Field>

        <Field label="Curso">
          <select value={form.courseId} onChange={(e) => set('courseId', e.target.value)} style={input}>
            <option value="">— Seleccionar —</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <Field label="Sucursal">
          {lockedSede !== null ? (
            <input value={lockedSede || '—'} disabled
              style={{ ...input, background: '#f1f5f9', color: '#475569' }} />
          ) : (
            <select value={form.sede} onChange={(e) => set('sede', e.target.value)} style={input}>
              <option value="">— A definir —</option>
              {sucursales.map((suc) => (
                <option key={suc.id} value={suc.nombre}>
                  {suc.nombre}{suc.direccion ? ` — ${suc.direccion}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Notas internas">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
            rows={2} style={{ ...input, resize: 'vertical' }} />
        </Field>

        {selected?.seniaReserva ? (
          <label style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14,
            background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12,
          }}>
            <input type="checkbox" checked={form.senaCobrada}
              onChange={(e) => set('senaCobrada', e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <strong>Ya cobré la seña</strong> de ${selected.seniaReserva.toLocaleString('es-AR')}{' '}
              (efectivo o transferencia).
              <br />
              <span style={{ color: '#475569', fontSize: 13 }}>
                Si la tildás, el alumno podrá elegir sucursal y turno sin pagar online.
              </span>
            </span>
          </label>
        ) : null}

        {error && <p style={{ color: '#b91c1c', margin: 0, fontSize: 14 }}>{error}</p>}

        <button type="submit" disabled={busy} style={primaryBtn}>
          {busy ? 'Creando…' : 'Crear inscripción'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'grid', gap: 5, fontSize: 14, color: '#334155' }}>
      <span>
        {label}
        {hint && <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

const input = {
  padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)',
  fontSize: 15, width: '100%', boxSizing: 'border-box' as const,
  fontFamily: 'inherit', color: 'var(--text)',
};
const primaryBtn = {
  padding: '11px 20px', background: 'var(--brand)', color: '#fff', border: '1px solid var(--brand)',
  borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 15, fontWeight: 600,
  display: 'inline-block', textAlign: 'center' as const, fontFamily: 'inherit',
} as const;
const secondaryBtn = {
  padding: '11px 20px', background: 'var(--surface)', color: 'var(--text-2)',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit', fontWeight: 600,
} as const;
