'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, type CertVerification } from '../../../lib/api';

/**
 * Verificación PÚBLICA de un certificado (la página que abre el QR). Confirma que
 * el certificado es auténtico (la firma electrónica coteja contra el contenido) y
 * muestra sus datos. No requiere sesión.
 */
export default function VerificarPage() {
  const params = useParams<{ codigo: string }>();
  const [data, setData] = useState<CertVerification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setData(await api.verifyCertificate(params.codigo)); }
      catch { setData({ valido: false }); }
      finally { setLoading(false); }
    })();
  }, [params.codigo]);

  if (loading) return <Centro><p style={{ color: '#64748b' }}>Verificando…</p></Centro>;

  if (!data || !data.valido) {
    return (
      <Centro>
        <div style={{ fontSize: 56 }}>⛔</div>
        <h1 style={{ margin: '8px 0' }}>Certificado no válido</h1>
        <p style={{ color: '#64748b', maxWidth: 420 }}>
          No pudimos verificar este certificado. El código puede ser incorrecto o el
          documento fue alterado.
        </p>
      </Centro>
    );
  }

  const d = data.datos as Record<string, string | number | null>;
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ background: data.anulado ? '#b91c1c' : '#16a34a', color: '#fff', padding: '20px 24px' }}>
          <div style={{ fontSize: 40 }}>{data.anulado ? '⚠️' : '✅'}</div>
          <h1 style={{ margin: '6px 0 2px', fontSize: 22 }}>
            {data.anulado ? 'Certificado ANULADO' : 'Certificado auténtico'}
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: 14 }}>Escuela de Manejo STOP · Mendoza</p>
        </div>
        <div style={{ padding: 24, display: 'grid', gap: 10 }}>
          <Row k="Nº de serie" v={data.serial} mono />
          <Row k="Alumno" v={String(d.alumno ?? '—')} />
          <Row k="DNI" v={String(d.dni ?? '—')} />
          <Row k="Curso" v={String(d.curso ?? '—')} />
          {d.categoria && <Row k="Categoría" v={String(d.categoria)} />}
          {d.sede && <Row k="Sucursal" v={String(d.sede)} />}
          {d.nota !== null && d.nota !== undefined && <Row k="Nota teórica" v={`${d.nota}%`} />}
          {d.instructor && <Row k="Instructor" v={String(d.instructor)} />}
          <Row k="Emitido" v={new Date(data.emitido_at).toLocaleDateString('es-AR')} />
        </div>
      </div>
      <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 16 }}>
        Verificación con firma electrónica. Este certificado se emitió digitalmente y su
        integridad fue validada por el sistema.
      </p>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
      <span style={{ color: '#64748b', fontSize: 14 }}>{k}</span>
      <span style={{ fontWeight: 600, fontSize: 14, fontFamily: mono ? 'monospace' : undefined, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      {children}
    </div>
  );
}
