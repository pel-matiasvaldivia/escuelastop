'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { api, type Course, type FormFieldKey } from '../../../lib/api';

// Etiquetas legibles de cada campo del formulario.
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

/**
 * Formulario de inscripción PÚBLICO y DINÁMICO.
 * El agente de WhatsApp envía el link con el token; los campos que se muestran
 * dependen del curso elegido (catálogo). Modo híbrido: llega prellenado con lo
 * que ya se captó en el chat.
 */
export default function EnrollmentForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cat = await api.catalog();
        setCourses(cat);
        // Prellenado desde la inscripción creada en el chat (modo híbrido).
        try {
          const enr = await api.enrollmentByToken(token);
          if (enr?.course) {
            const match = cat.find((c) => c.name === enr.course || c.id === enr.course);
            if (match) setSelectedId(match.id);
          }
          if (enr?.sede) setValues((v) => ({ ...v, sucursal: enr.sede! }));
        } catch { /* token sin inscripción previa: se elige el curso a mano */ }
      } catch {
        setLoadError('No se pudo cargar el catálogo. ¿Está corriendo el backend?');
      }
    })();
  }, [token]);

  const course = useMemo(
    () => courses.find((c) => c.id === selectedId),
    [courses, selectedId],
  );

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO backend: POST /api/public/enrollment/:token con values + adjuntos.
    setSubmitted(true);
  }

  if (loadError) return <p style={{ color: '#b91c1c', padding: 24 }}>{loadError}</p>;

  if (submitted) {
    return (
      <div style={card}>
        <h2>¡Gracias! 🎉</h2>
        <p>Recibimos tu inscripción a <b>{course?.name}</b>. Un asesor te va a
        contactar para confirmar el turno y la reserva.</p>
      </div>
    );
  }

  return (
    <div style={card}>
      <h2>Inscripción — Escuela STOP</h2>

      <label style={label}>Curso</label>
      <select
        value={selectedId}
        onChange={(e) => { setSelectedId(e.target.value); }}
        style={input}
      >
        <option value="">Elegí un curso…</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {course && (
        <>
          {(course.price !== null || course.priceNote) && (
            <p style={{ color: '#475569', fontSize: 14 }}>
              {course.price !== null && <b>${course.price.toLocaleString('es-AR')} </b>}
              {course.priceNote}
            </p>
          )}
          {course.contactSucursal && (
            <p style={note}>
              ⚠️ Esta modalidad se contrata comunicándote con la sucursal. Dejanos
              tus datos y te contactamos.
            </p>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14, marginTop: 12 }}>
            {course.requiredFields.map((field) => {
              if (field === 'turno' && course.schedules?.length) {
                return (
                  <div key={field}>
                    <label style={label}>{FIELD_LABELS[field]} *</label>
                    <select
                      required
                      value={values.turno ?? ''}
                      onChange={(e) => setField('turno', e.target.value)}
                      style={input}
                    >
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
                    <select
                      required
                      value={values.sucursal ?? ''}
                      onChange={(e) => setField('sucursal', e.target.value)}
                      style={input}
                    >
                      <option value="">Elegí una sucursal…</option>
                      <option value="Guaymallén">Guaymallén</option>
                      <option value="Las Heras">Las Heras</option>
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
                    onChange={(e) => setField(field, e.target.value)}
                    style={input}
                  />
                </div>
              );
            })}

            {course.notes?.length ? (
              <ul style={{ fontSize: 13, color: '#64748b', paddingLeft: 18 }}>
                {course.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            ) : null}

            <button type="submit" style={submitBtn}>Enviar inscripción</button>
          </form>
        </>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  maxWidth: 560, margin: '24px auto', background: '#fff',
  padding: 24, borderRadius: 12, border: '1px solid #e2e8f0',
};
const label: React.CSSProperties = { display: 'block', fontSize: 13, color: '#475569', marginBottom: 4, fontWeight: 600 };
const input: React.CSSProperties = { width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 };
const note: React.CSSProperties = { background: '#fef9c3', padding: 10, borderRadius: 8, fontSize: 13 };
const submitBtn: React.CSSProperties = { padding: '12px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontWeight: 600 };
