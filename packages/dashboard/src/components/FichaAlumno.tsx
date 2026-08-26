'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api, UnauthorizedError,
  type Enrollment, type StudentDocument, type DocumentKind,
} from '../lib/api';

const DOC_LABELS: Record<DocumentKind, string> = {
  foto_licencia: 'Licencia',
  foto_dni: 'DNI',
  apto_medico: 'Apto médico',
};

const LICENSE_LABELS: Record<string, { text: string; color: string }> = {
  vigente: { text: 'Licencia vigente', color: '#16a34a' },
  proxima: { text: 'Licencia próxima a vencer', color: '#ea580c' },
  vencida: { text: 'Licencia vencida', color: '#dc2626' },
};

/**
 * Ficha del alumno: inscripciones del contacto con sus documentos (DNI,
 * licencia, apto médico) y la resolución de los casos que quedaron pendientes
 * de verificación de licencia.
 */
export default function FichaAlumno({ contactId }: { contactId: string }) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEnrollments(await api.contactEnrollments(contactId));
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) return;
      setError('No se pudieron cargar las inscripciones.');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p style={{ color: '#94a3b8', fontSize: 14 }}>Cargando inscripciones…</p>;
  if (error) return <p style={{ color: '#b91c1c', fontSize: 14 }}>{error}</p>;
  if (enrollments.length === 0) {
    return (
      <p style={{ color: '#94a3b8', fontSize: 14 }}>
        Este contacto todavía no completó el formulario de inscripción.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {enrollments.map((e) => (
        <EnrollmentCard key={e.id} enrollment={e} onChange={load} />
      ))}
    </div>
  );
}

function EnrollmentCard({
  enrollment, onChange,
}: { enrollment: Enrollment; onChange: () => void }) {
  const [docs, setDocs] = useState<StudentDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    api.enrollmentDocuments(enrollment.id).then(setDocs).catch(() => setDocs([]));
  }, [enrollment.id]);

  const needsReview = enrollment.status === 'pendiente_verificacion';
  const license = enrollment.license_status
    ? LICENSE_LABELS[enrollment.license_status]
    : null;

  async function review(approve: boolean) {
    const verb = approve ? 'habilitar' : 'rechazar';
    if (!confirm(`¿Confirmás ${verb} este trámite?`)) return;
    setBusy(true);
    try {
      await api.reviewLicense(enrollment.id, approve, note);
      setNote('');
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al registrar la revisión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: '#fff', border: `1px solid ${needsReview ? '#fed7aa' : '#e2e8f0'}`,
      borderRadius: 10, padding: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ fontSize: 15 }}>{enrollment.course ?? 'Curso sin definir'}</strong>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
            {enrollment.sede ?? 'Sede a definir'} ·{' '}
            {new Date(enrollment.updated_at).toLocaleDateString('es-AR')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Badge text={enrollment.status} color={statusColor(enrollment.status)} />
          <Badge
            text={`Seña ${enrollment.payment_status}`}
            color={enrollment.payment_status === 'aprobado' ? '#16a34a' : '#94a3b8'}
          />
        </div>
      </div>

      {/* --- Estado de la licencia --- */}
      {license && (
        <div style={{ marginTop: 12, fontSize: 14 }}>
          <span style={{ color: license.color, fontWeight: 600 }}>{license.text}</span>
          {enrollment.license_expiry && (
            <span style={{ color: '#64748b' }}>
              {' '}· vence {new Date(enrollment.license_expiry).toLocaleDateString('es-AR')}
            </span>
          )}
          {enrollment.license_verified && (
            <span style={{ color: '#16a34a' }}> · habilitada por administración</span>
          )}
        </div>
      )}

      {/* --- Documentos subidos --- */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 8, fontWeight: 600 }}>
          Documentos ({docs.length})
        </div>
        {docs.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Sin documentos subidos.</p>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {docs.map((d) => <DocThumb key={d.id} doc={d} />)}
          </div>
        )}
      </div>

      {/* --- Notas (incluye el cotejo anti-fraude del vencimiento) --- */}
      {enrollment.notes && (
        <pre style={{
          marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: 8, padding: 10, fontSize: 12, color: '#475569',
          whiteSpace: 'pre-wrap', fontFamily: 'inherit',
        }}>{enrollment.notes}</pre>
      )}

      {/* --- Acción de administración --- */}
      {needsReview && (
        <div style={{
          marginTop: 14, paddingTop: 14, borderTop: '1px dashed #fed7aa',
        }}>
          <p style={{ fontSize: 13, color: '#9a3412', marginTop: 0 }}>
            Este trámite espera verificación humana. Revisá la foto de la licencia:
            si el alumno puede cursar igual, <strong>habilitalo</strong> para que
            continúe con el pago de la seña.
          </p>
          <input
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            placeholder="Nota (opcional): qué verificaste"
            style={{
              width: '100%', padding: 8, borderRadius: 8,
              border: '1px solid #cbd5e1', fontSize: 14, marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => review(true)} disabled={busy} style={okBtn}>
              Habilitar para continuar
            </button>
            <button onClick={() => review(false)} disabled={busy} style={noBtn}>
              Rechazar trámite
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Miniatura del documento; las imágenes se ven inline, el resto como enlace. */
function DocThumb({ doc }: { doc: StudentDocument }) {
  const url = api.documentUrl(doc.id);
  const isImage = (doc.mime_type ?? '').startsWith('image/');
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{ textDecoration: 'none', color: '#334155' }}
    >
      <div style={{
        border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden',
        width: 130, background: '#f8fafc',
      }}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={DOC_LABELS[doc.kind]}
            style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            height: 96, display: 'grid', placeItems: 'center', fontSize: 30,
          }}>📄</div>
        )}
        <div style={{ padding: '6px 8px', fontSize: 12, fontWeight: 600 }}>
          {DOC_LABELS[doc.kind]}
        </div>
      </div>
    </a>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      background: color, color: '#fff', padding: '2px 10px',
      borderRadius: 12, fontSize: 12,
    }}>{text}</span>
  );
}

function statusColor(status: string): string {
  const colors: Record<string, string> = {
    nuevo: '#64748b', contactado: '#0891b2', inscripto: '#7c3aed',
    pagado: '#16a34a', completado: '#15803d', cancelado: '#dc2626',
    pendiente_verificacion: '#ea580c',
  };
  return colors[status] ?? '#64748b';
}

const okBtn = {
  padding: '9px 16px', background: '#16a34a', color: '#fff', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
} as const;
const noBtn = {
  padding: '9px 16px', background: '#fff', color: '#dc2626',
  border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', fontSize: 14,
} as const;
