'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api, type Course, type FormFieldKey, type SucursalInfo, type OpenCourseOption,
} from '../../../lib/api';

function fmtFecha(iso: string | null): string {
  if (!iso) return 'a confirmar';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'a confirmar' : d.toLocaleDateString('es-AR');
}

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
  const [simulatedPay, setSimulatedPay] = useState(false);
  // Sub-paso del pago: elegir método, esperar acreditación, o cupón en efectivo.
  const [payMode, setPayMode] = useState<'choose' | 'waiting' | 'ticket'>('choose');
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  // Cursos abiertos de la sucursal elegida (paso post-pago) + cohorte elegido.
  const [openCourses, setOpenCourses] = useState<OpenCourseOption[] | null>(null);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [chosenCourse, setChosenCourse] = useState('');
  // Resultado de la matriculación para la pantalla final. Con la seña (anticipo)
  // el alumno queda inscripto pero con el pago pendiente de completar; el código
  // se habilita cuando administración registra el pago total.
  const [matricula, setMatricula] = useState<
    { curso: string; saldo: number | null } | null
  >(null);
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

  // Al entrar al paso de turno y elegir sucursal, buscamos los cursos ABIERTOS
  // de esa sucursal para que el alumno elija cohorte y quede matriculado.
  useEffect(() => {
    if (step !== 'turno' || !values.sucursal) {
      setOpenCourses(null);
      setChosenCourse('');
      return;
    }
    let cancelled = false;
    setCoursesLoading(true);
    setChosenCourse('');
    api.availableCourses(token, values.sucursal)
      .then((list) => { if (!cancelled) setOpenCourses(list); })
      .catch(() => { if (!cancelled) setOpenCourses([]); })
      .finally(() => { if (!cancelled) setCoursesLoading(false); });
    return () => { cancelled = true; };
  }, [step, values.sucursal, token]);

  const course = useMemo(() => courses.find((c) => c.id === selectedId), [courses, selectedId]);
  const requiresPayment = !!course?.seniaReserva;

  // Campos de datos personales (todo menos los que van después del pago).
  const preFields = (course?.requiredFields ?? []).filter((f) => !POST_PAYMENT_FIELDS.includes(f));
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
      // Vamos al paso de pago para que el alumno elija el medio.
      setPayMode('choose');
      setTicketUrl(null);
      setStep('pago');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudieron guardar los datos');
    } finally {
      setBusy(false);
    }
  }

  // Pago con tarjeta / dinero en cuenta (Mercado Pago Checkout).
  async function payWithCheckout() {
    if (!course) return;
    setBusy(true);
    try {
      const { checkoutUrl, simulated } = await api.startPayment(token, course.id, {
        payerEmail: values.email, method: 'checkout',
      });
      setSimulatedPay(!!simulated);
      setPayMode('waiting');
      // En modo test (mock) el pago se aprueba solo: no abrimos checkout, solo
      // hacemos polling hasta que el backend confirme y avanzamos al turno.
      if (!simulated && checkoutUrl) window.open(checkoutUrl, '_blank');
      startPolling();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error iniciando el pago');
    } finally {
      setBusy(false);
    }
  }

  // Pago en efectivo con cupón (Rapipago / Pago Fácil): queda pre-inscripto.
  async function payWithTicket(method: 'rapipago' | 'pagofacil') {
    if (!course) return;
    if (!values.email) {
      alert('Para pagar en efectivo necesitamos tu email (para enviarte el cupón).');
      return;
    }
    setBusy(true);
    try {
      const { ticketUrl: url } = await api.startPayment(token, course.id, {
        payerEmail: values.email, method,
      });
      if (url) {
        setTicketUrl(url);
        setPayMode('ticket');
        window.open(url, '_blank');
        // Seguimos consultando por si paga el cupón mientras tanto.
        startPolling();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo generar el cupón');
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

  // ¿Hay algún cohorte con asiento libre para elegir?
  const hayCursosElegibles = (openCourses ?? []).some((c) => !c.completo);

  async function submitTurno(e: React.FormEvent) {
    e.preventDefault();
    if (!values.sucursal) { alert('Elegí una sucursal.'); return; }
    if (hayCursosElegibles && !chosenCourse) {
      alert('Elegí uno de los cursos disponibles.');
      return;
    }
    setBusy(true);
    try {
      if (chosenCourse) {
        // Matriculación automática en el cohorte elegido.
        const resp = await api.saveSchedule(token, {
          trainingCourseId: chosenCourse,
          fullName: values.nombre,
          dni: values.dni,
        });
        setMatricula({
          curso: resp.curso_nombre ?? course?.name ?? '',
          saldo: resp.saldo_pendiente ?? null,
        });
      } else {
        // No hay cohortes abiertos: guardamos la sucursal y administración coordina.
        await api.saveSchedule(token, { sede: values.sucursal });
      }
      setStep('listo');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo confirmar la inscripción');
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p style={{ color: '#b91c1c', padding: 24 }}>{loadError}</p>;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 4 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#ef4444,#b91c1c)', boxShadow: '0 4px 12px -3px rgba(239,68,68,.5)' }} aria-hidden>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', boxShadow: 'inset 0 0 0 3px #b91c1c' }} />
        </span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>Escuela de Manejo STOP</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Formulario de inscripción</div>
        </div>
      </div>
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

      {/* Paso 2: pago de la seña */}
      {step === 'pago' && course && (
        <div style={{ padding: '12px 0' }}>
          {/* 2.a) Elegir medio de pago */}
          {payMode === 'choose' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <p style={{ ...note }}>
                Pagá la seña de <b>${course.seniaReserva!.toLocaleString('es-AR')}</b> para
                reservar tu lugar. Elegí cómo querés pagar:
              </p>
              <button type="button" onClick={payWithCheckout} disabled={busy} style={submitBtn}>
                💳 Pagar con tarjeta o dinero en cuenta (Mercado Pago)
              </button>
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>o en efectivo</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button" onClick={() => payWithTicket('rapipago')} disabled={busy}
                  style={{ ...cashBtn, flex: 1 }}
                >
                  🧾 Rapipago
                </button>
                <button
                  type="button" onClick={() => payWithTicket('pagofacil')} disabled={busy}
                  style={{ ...cashBtn, flex: 1 }}
                >
                  🧾 Pago Fácil
                </button>
              </div>
              <p style={{ color: '#64748b', fontSize: 12 }}>
                Con efectivo generamos un cupón: quedás <b>pre-inscripto</b> y tu lugar se
                confirma cuando lo abonás en Rapipago o Pago Fácil.
              </p>
            </div>
          )}

          {/* 2.b) Esperando acreditación (checkout) */}
          {payMode === 'waiting' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 15 }}>
                {simulatedPay ? 'Procesando el pago de prueba…' : 'Esperando la confirmación del pago…'}
              </p>
              <p style={{ color: '#64748b', fontSize: 14 }}>
                {simulatedPay
                  ? 'Estás en modo de prueba: la seña se acredita automáticamente. En unos segundos vas a poder elegir tu curso.'
                  : 'Completá el pago en la pestaña que se abrió. Esta página se actualiza sola cuando se acredite.'}
              </p>
              <div style={{ fontSize: 32 }}>⏳</div>
            </div>
          )}

          {/* 2.c) Cupón en efectivo generado (pre-inscripto) */}
          {payMode === 'ticket' && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 40 }}>🧾</div>
              <h3>Quedaste pre-inscripto</h3>
              <p style={{ color: '#475569', fontSize: 14 }}>
                Generamos tu cupón de pago por <b>${course.seniaReserva!.toLocaleString('es-AR')}</b>.
                Pagalo en <b>Rapipago o Pago Fácil</b>. Cuando se acredite, tu lugar queda
                confirmado y vas a poder elegir tu curso.
              </p>
              {ticketUrl && (
                <a href={ticketUrl} target="_blank" rel="noreferrer"
                  style={{ ...submitBtn, display: 'inline-block', textDecoration: 'none', marginTop: 8 }}>
                  Ver / imprimir el cupón
                </a>
              )}
              <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 12 }}>
                Esta página se actualiza sola cuando se acredite el pago. También podés
                cerrarla: te avisamos por WhatsApp y mail.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Paso 3: elegir sucursal y curso (habilitado SOLO tras pagar) */}
      {step === 'turno' && course && (
        <form onSubmit={submitTurno} style={{ display: 'grid', gap: 14, marginTop: 12 }}>
          {requiresPayment && (
            <p style={{ ...note, background: '#dcfce7' }}>
              ✅ Seña confirmada. Elegí tu sucursal y el curso para quedar matriculado.
            </p>
          )}
          {renderField('sucursal', values, setField, setFile, sucursales, course)}

          {/* Cursos abiertos de la sucursal elegida (con fecha y asientos). */}
          {values.sucursal && (
            <div>
              <label style={label}>Curso disponible *</label>
              {coursesLoading && <p style={{ color: '#64748b', fontSize: 14 }}>Buscando cursos disponibles…</p>}
              {!coursesLoading && openCourses && openCourses.length === 0 && (
                <p style={note}>
                  Por ahora no hay cursos con fecha abierta en esta sucursal. Podés
                  confirmar igual y <b>administración te contacta</b> para asignarte
                  la fecha de inicio.
                </p>
              )}
              {!coursesLoading && openCourses && openCourses.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {openCourses.map((oc) => (
                    <label
                      key={oc.id}
                      style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: 10, borderRadius: 8,
                        border: `1px solid ${chosenCourse === oc.id ? '#16a34a' : '#cbd5e1'}`,
                        background: oc.completo ? '#f8fafc' : '#fff',
                        opacity: oc.completo ? 0.6 : 1,
                        cursor: oc.completo ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="cohorte"
                        value={oc.id}
                        disabled={oc.completo}
                        checked={chosenCourse === oc.id}
                        onChange={() => setChosenCourse(oc.id)}
                        style={{ marginTop: 3 }}
                      />
                      <span style={{ fontSize: 14 }}>
                        <b>{oc.nombre}</b><br />
                        <span style={{ color: '#475569' }}>
                          Inicio: {fmtFecha(oc.fecha_inicio)} ·{' '}
                          {oc.completo
                            ? 'COMPLETO'
                            : oc.asientos_libres === null
                              ? 'Cupos disponibles'
                              : `${oc.asientos_libres} ${oc.asientos_libres === 1 ? 'asiento' : 'asientos'} libre${oc.asientos_libres === 1 ? '' : 's'}`}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DNI: necesario para la matrícula si todavía no lo tenemos. */}
          {values.sucursal && hayCursosElegibles && !values.dni && (
            <div>
              <label style={label}>DNI *</label>
              <input
                required
                type="text"
                value={values.dni ?? ''}
                onChange={(e) => setField('dni', e.target.value)}
                style={input}
              />
            </div>
          )}

          {course.contactSucursal && (
            <p style={note}>⚠️ Esta modalidad se coordina con la sucursal. Te vamos a contactar.</p>
          )}
          <button type="submit" disabled={busy || !values.sucursal} style={submitBtn}>
            Confirmar inscripción
          </button>
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
          <p>Quedaste inscripto en <b>{matricula?.curso || course?.name}</b>.</p>
          {matricula ? (
            <>
              <div style={{
                textAlign: 'left', margin: '14px auto 0', maxWidth: 420,
                padding: '12px 16px', borderRadius: 10,
                border: '1px solid #fde68a', background: '#fffbeb',
              }}>
                <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#92400e' }}>
                  💳 Falta completar el pago
                </p>
                <p style={{ margin: 0, fontSize: 14, color: '#78350f' }}>
                  Pagaste la <b>seña (anticipo)</b>. El resto del curso
                  {typeof matricula.saldo === 'number' && matricula.saldo > 0
                    ? <> —<b> ${matricula.saldo.toLocaleString('es-AR')}</b>— </>
                    : ' '}
                  se abona <b>de forma presencial en la sucursal</b>.
                </p>
              </div>
              <p style={{ color: '#475569', fontSize: 14, marginTop: 12 }}>
                Cuando completes el pago te <b>habilitamos tu código de alumno</b> para
                rendir el examen y te lo enviamos por WhatsApp y por mail.
              </p>
            </>
          ) : (
            <p>Un asesor te va a escribir por WhatsApp.</p>
          )}
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
    <div style={{ display: 'flex', gap: 8, margin: '18px 0 20px' }}>
      {steps.map(([key, lbl], i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              height: 5, borderRadius: 999,
              background: i <= current ? 'var(--brand)' : 'var(--surface-3)',
              transition: 'background .2s',
            }} />
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
              color: active ? 'var(--brand-600)' : done ? 'var(--text-2)' : 'var(--muted-2)',
              fontWeight: active ? 700 : 500,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontSize: 10.5, fontWeight: 700,
                background: i <= current ? 'var(--brand)' : 'var(--surface-3)',
                color: i <= current ? '#fff' : 'var(--muted)',
              }}>{done ? '✓' : i + 1}</span>
              {lbl}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const card: React.CSSProperties = { maxWidth: 580, margin: '28px auto', background: 'var(--surface)', padding: 28, borderRadius: 16, border: '1px solid var(--border)', boxShadow: 'var(--shadow)' };
const label: React.CSSProperties = { display: 'block', fontSize: 12.5, color: 'var(--text-2)', marginBottom: 5, fontWeight: 600 };
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', fontSize: 14, fontFamily: 'inherit', color: 'var(--text)' };
const note: React.CSSProperties = { background: 'var(--warning-bg)', border: '1px solid var(--warning-br)', color: 'var(--warning)', padding: '10px 12px', borderRadius: 10, fontSize: 13 };
const submitBtn: React.CSSProperties = { padding: '12px 20px', background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer', fontWeight: 600 };
const cashBtn: React.CSSProperties = { padding: '12px 16px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontWeight: 600 };
