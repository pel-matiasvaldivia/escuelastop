'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Course, type FormFieldKey , type SucursalInfo } from '../../../lib/api';

const FIELD_LABELS: Record<FormFieldKey, string> = {
  nombre: 'Nombre y apellido',
  dni: 'DNI',
  edad: 'Edad',
  email: 'Correo electrónico',
  telefono: 'Teléfono',
  sucursal: 'Sucursal',
  turno: 'Curso / turno',
  foto_licencia: 'Foto de la licencia (de frente)',
  foto_dni: 'Foto del DNI',
  apto_medico: 'Apto médico',
};
const FILE_FIELDS: FormFieldKey[] = ['foto_licencia', 'foto_dni', 'apto_medico'];

// Campos que dependen de haber pagado la seña (van DESPUÉS del gate de pago).
const POST_PAYMENT_FIELDS: FormFieldKey[] = ['sucursal', 'turno'];

type Step = 'datos' | 'pago' | 'turno' | 'listo' | 'verificacion';

/**
 * Formulario de inscripción con GATE DE PAGO.
 * Flujo: (1) datos personales → (2) pago de la seña (obligatorio) →
 * (3) recién ahí se habilita elegir sucursal y turno → (4) confirmación.
 * Esto evita las reservas de gente que después no se presenta.
 */
// En Next 14 `params` es un objeto plano (recién en 15 pasa a ser una Promise).
// Pasárselo a use() lanza el error de React #438 y rompe la página entera.
export default function EnrollmentForm({ params }: { params: { token: string } }) {
  const { token } = params;
  const [courses, setCourses] = useState<Course[]>([]);
  const [sucursales, setSucursales] = useState<SucursalInfo[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [step, setStep] = useState<Step>('datos');
  const [licenseInfo, setLicenseInfo] = useState<{ status: string; days: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        api.sucursales().then(setSucursales).catch(() => setSucursales([]));
        const cat = await api.catalog();
        setCourses(cat);
        try {
          const enr = await api.enrollmentByToken(token);
          if (enr?.course) {
            const match = cat.find((c) => c.name === enr.course || c.id === enr.course);
            if (match) setSelectedId(match.id);
          }
          if (enr?.sede) setValues((v) => ({ ...v, sucursal: enr.sede! }));
          // Si el pago ya estaba aprobado (p.ej. volvió del checkout), saltamos al turno.
          if (enr?.payment_status === 'aprobado') setStep('turno');
        } catch { /* token sin inscripción previa */ }
      } catch {
        setLoadError('No se pudo cargar el catálogo. ¿Está corriendo el backend?');
      }
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token]);

  const course = useMemo(() => courses.find((c) => c.id === selectedId), [courses, selectedId]);
  const requiresPayment = !!course?.seniaReserva;

  // Campos de datos personales (todo menos los que van después del pago).
  const preFields = (course?.requiredFields ?? []).filter((f) => !POST_PAYMENT_FIELDS.includes(f));
  const postFields = (course?.requiredFields ?? []).filter((f) => POST_PAYMENT_FIELDS.includes(f));
  const needsLicense = (course?.requiredFields ?? []).includes('foto_licencia');

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }
  function setFile(key: string, file: File) {
    setFiles((f) => ({ ...f, [key]: file }));
  }

  // Paso 1 → guardar datos + fotos, luego iniciar pago (o saltar si no hay seña).
  async function submitDatos(e: React.FormEvent) {
    e.preventDefault();
    if (!course) return;
    setBusy(true);
    try {
      // Guardar datos personales y adjuntos (los gestiona el formulario).
      const fd = new FormData();
      for (const k of ['nombre', 'dni', 'edad', 'email', 'telefono']) {
        if (values[k]) fd.append(k, values[k]);
      }
      for (const k of FILE_FIELDS) {
        if (files[k]) fd.append(k, files[k]);
      }
      if (needsLicense && values.licenciaVencimiento) {
        fd.append('licenciaVencimiento', values.licenciaVencimiento);
      }
      const resp = await api.submitDetails(token, fd);

      // Licencia vencida o próxima a vencer → verificación humana, no avanza al pago.
      if (resp?.licenseReview) {
        setLicenseInfo({ status: resp.licenseStatus ?? 'vencida', days: resp.daysToExpiry ?? 0 });
        setStep('verificacion');
        return;
      }

      if (!requiresPayment) { setStep('turno'); return; }
      const { checkoutUrl } = await api.startPayment(token, course.id, undefined, values.email);
      setStep('pago');
      // Abrimos el checkout en otra pestaña y empezamos a chequear el estado.
      window.open(checkoutUrl, '_blank');
      startPolling();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error iniciando el pago');
    } finally {
      setBusy(false);
    }
  }

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { payment_status } = await api.paymentStatus(token);
      if (payment_status === 'aprobado') {
        if (pollRef.current) clearInterval(pollRef.current);
        setStep('turno');
      }
    }, 3000);
  }

  async function submitTurno(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const turnoLabel = course?.schedules?.find((s) => s.id === values.turno);
      const notes = turnoLabel
        ? `Turno: ${turnoLabel.sucursal} · ${turnoLabel.turno} · ${turnoLabel.dias} · ${turnoLabel.horario}`
        : '';
      await api.saveSchedule(token, values.sucursal ?? '', notes);
      setStep('listo');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo guardar el turno');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p style={{ color: '#b91c1c', padding: 24 }}>{loadError}</p>;

  return (
    <div style={card}>
      <h2>Inscripción — Escuela STOP</h2>
      <Stepper step={step} requiresPayment={requiresPayment} />

      {/* Selección de curso (siempre visible en el paso de datos) */}
      {step === 'datos' && (
        <>
          <label style={label}>Curso</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={input}>
            <option value="">Elegí un curso…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {course && (
            <form onSubmit={submitDatos} style={{ display: 'grid', gap: 14, marginTop: 12 }}>
              {(course.price !== null || course.priceNote) && (
                <p style={{ color: '#475569', fontSize: 14 }}>
                  {course.price !== null && <b>${course.price.toLocaleString('es-AR')} </b>}
                  {course.priceNote}
                </p>
              )}
              {requiresPayment && (
                <p style={note}>
                  🔒 Para reservar necesitás pagar una seña de{' '}
                  <b>${course.seniaReserva!.toLocaleString('es-AR')}</b>. Recién después
                  vas a poder elegir <b>sucursal y turno</b>.
                </p>
              )}
              {preFields.map((field) => renderField(field, values, setField, setFile, sucursales))}
              {needsLicense && (
                <div>
                  <label style={label}>Vencimiento de la licencia actual *</label>
                  <input
                    required
                    type="date"
                    value={values.licenciaVencimiento ?? ''}
                    onChange={(e) => setField('licenciaVencimiento', e.target.value)}
                    style={input}
                  />
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    La licencia debe estar vigente y con más de 90 días hasta su
                    vencimiento para continuar online.
                  </p>
                </div>
              )}
              <button type="submit" disabled={busy} style={submitBtn}>
                {requiresPayment ? 'Continuar al pago de la seña →' : 'Continuar →'}
              </button>
            </form>
          )}
        </>
      )}

      {/* Paso 2: esperando confirmación del pago */}
      {step === 'pago' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <p style={{ fontSize: 15 }}>Esperando la confirmación del pago…</p>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            Completá el pago en la pestaña que se abrió. Esta página se actualiza sola
            cuando se acredite.
          </p>
          <div style={{ fontSize: 32 }}>⏳</div>
        </div>
      )}

      {/* Paso 3: elegir sucursal y turno (habilitado SOLO tras pagar) */}
      {step === 'turno' && course && (
        <form onSubmit={submitTurno} style={{ display: 'grid', gap: 14, marginTop: 12 }}>
          {requiresPayment && (
            <p style={{ ...note, background: '#dcfce7' }}>✅ Seña confirmada. Elegí tu turno.</p>
          )}
          {(postFields.length ? postFields : (['sucursal'] as FormFieldKey[]))
            .map((field) => renderField(field, values, setField, setFile, sucursales, course))}
          {course.contactSucursal && (
            <p style={note}>⚠️ Esta modalidad se coordina con la sucursal. Te vamos a contactar.</p>
          )}
          <button type="submit" disabled={busy} style={submitBtn}>Confirmar inscripción</button>
        </form>
      )}

      {step === 'verificacion' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 40 }}>🕒</div>
          <h3>Tu trámite quedó pendiente de verificación</h3>
          <p>
            Detectamos que tu licencia está{' '}
            <b>{licenseInfo?.status === 'vencida' ? 'vencida' : 'próxima a vencer'}</b>
            {typeof licenseInfo?.days === 'number' && licenseInfo.status === 'proxima' &&
              ` (vence en ${licenseInfo.days} días)`}.
          </p>
          <p>
            Por eso no podés continuar con el pago online. <b>Administración va a
            revisar tu caso</b> y te va a contactar por WhatsApp para indicarte cómo
            seguir.
          </p>
        </div>
      )}

      {step === 'listo' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <h3>¡Inscripción confirmada!</h3>
          <p>Te esperamos en <b>{course?.name}</b>. Un asesor te va a escribir por WhatsApp.</p>
        </div>
      )}
    </div>
  );
}

function renderField(
  field: FormFieldKey,
  values: Record<string, string>,
  setField: (k: string, v: string) => void,
  setFile: (k: string, file: File) => void,
  sucursales: SucursalInfo[],
  course?: Course,
) {
  if (field === 'turno' && course?.schedules?.length) {
    return (
      <div key={field}>
        <label style={label}>{FIELD_LABELS[field]} *</label>
        <select required value={values.turno ?? ''} onChange={(e) => setField('turno', e.target.value)} style={input}>
          <option value="">Elegí un turno…</option>
          {course.schedules.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sucursal} · {s.turno} · {s.dias} · {s.horario}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field === 'sucursal') {
    return (
      <div key={field}>
        <label style={label}>{FIELD_LABELS[field]} *</label>
        <select required value={values.sucursal ?? ''} onChange={(e) => setField('sucursal', e.target.value)} style={input}>
          <option value="">Elegí una sucursal…</option>
          {sucursales.map((suc) => (
            <option key={suc.id} value={suc.nombre}>
              {suc.nombre}{suc.direccion ? ` — ${suc.direccion}` : ''}
            </option>
          ))}
        </select>
      </div>
    );
  }
  const isFile = FILE_FIELDS.includes(field);
  return (
    <div key={field}>
      <label style={label}>{FIELD_LABELS[field]} *</label>
      <input
        required
        type={isFile ? 'file' : field === 'email' ? 'email' : field === 'edad' ? 'number' : 'text'}
        accept={isFile ? 'image/*' : undefined}
        value={isFile ? undefined : values[field] ?? ''}
        onChange={(e) =>
          isFile
            ? e.target.files?.[0] && setFile(field, e.target.files[0])
            : setField(field, e.target.value)
        }
        style={input}
      />
    </div>
  );
}

function Stepper({ step, requiresPayment }: { step: Step; requiresPayment: boolean }) {
  const steps = requiresPayment
    ? [['datos', 'Datos'], ['pago', 'Seña'], ['turno', 'Turno']]
    : [['datos', 'Datos'], ['turno', 'Turno']];
  const order = steps.map((s) => s[0]);
  const current = order.indexOf(step === 'listo' ? order[order.length - 1] : step);
  return (
    <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px' }}>
      {steps.map(([key, lbl], i) => (
        <div key={key} style={{
          flex: 1, textAlign: 'center', fontSize: 12, padding: '6px 0', borderRadius: 6,
          background: i <= current ? '#0f172a' : '#e2e8f0',
          color: i <= current ? '#fff' : '#64748b',
        }}>
          {i + 1}. {lbl}
        </div>
      ))}
    </div>
  );
}

const card: React.CSSProperties = { maxWidth: 560, margin: '24px auto', background: '#fff', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0' };
const label: React.CSSProperties = { display: 'block', fontSize: 13, color: '#475569', marginBottom: 4, fontWeight: 600 };
const input: React.CSSProperties = { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 };
const note: React.CSSProperties = { background: '#fef9c3', padding: 10, borderRadius: 8, fontSize: 13 };
const submitBtn: React.CSSProperties = { padding: '12px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontWeight: 600 };
