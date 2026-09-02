'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, auth, UnauthorizedError, type AppSettings, type SettingsUpdate } from '../../lib/api';
import ConfigTabs from '../../components/ConfigTabs';

/**
 * Configuración de la empresa (solo admin): datos y logo, servidor SMTP para las
 * notificaciones y credenciales del agente de IA. Lo guardado acá tiene prioridad
 * sobre el .env, así la empresa configura todo sin redeployar.
 */
export default function ConfiguracionPage() {
  const router = useRouter();
  const [s, setS] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [logoTs, setLogoTs] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Campos editables (se hidratan de `s`). Los secretos van vacíos: solo se
  // envían si el admin escribe algo nuevo.
  const [f, setF] = useState<Record<string, string>>({});
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpPass, setSmtpPass] = useState('');
  const [aiKey, setAiKey] = useState('');

  useEffect(() => {
    if (!auth.isAuthenticated()) return void router.replace('/login');
    if (!auth.isAdmin()) return void router.replace('/');
    (async () => {
      try {
        const data = await api.settings();
        hydrate(data);
      } catch (err) {
        if (err instanceof UnauthorizedError) return router.replace('/login');
        setError('No se pudo cargar la configuración.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function hydrate(data: AppSettings) {
    setS(data);
    setF({
      empresa_nombre: data.empresa_nombre ?? '',
      cuit: data.cuit ?? '',
      domicilio: data.domicilio ?? '',
      email: data.email ?? '',
      telefono: data.telefono ?? '',
      smtp_host: data.smtp_host ?? '',
      smtp_port: data.smtp_port != null ? String(data.smtp_port) : '',
      smtp_user: data.smtp_user ?? '',
      mail_from: data.mail_from ?? '',
      ai_model: data.ai_model ?? '',
      ai_instrucciones: data.ai_instrucciones ?? '',
    });
    setSmtpSecure(!!data.smtp_secure);
    setSmtpPass('');
    setAiKey('');
  }

  function set(k: string, v: string) { setF((p) => ({ ...p, [k]: v })); }

  function flash(msg: string) {
    setNotice(msg); setError(null);
    setTimeout(() => setNotice(null), 3500);
  }

  async function save(section: 'empresa' | 'smtp' | 'ai') {
    setError(null);
    let payload: SettingsUpdate = {};
    if (section === 'empresa') {
      payload = {
        empresa_nombre: f.empresa_nombre, cuit: f.cuit, domicilio: f.domicilio,
        email: f.email, telefono: f.telefono,
      };
    } else if (section === 'smtp') {
      payload = {
        smtp_host: f.smtp_host,
        smtp_port: f.smtp_port ? Number(f.smtp_port) : null,
        smtp_secure: smtpSecure,
        smtp_user: f.smtp_user,
        mail_from: f.mail_from,
        ...(smtpPass ? { smtp_pass: smtpPass } : {}),
      };
    } else {
      payload = {
        ai_model: f.ai_model,
        ai_instrucciones: f.ai_instrucciones,
        ...(aiKey ? { ai_api_key: aiKey } : {}),
      };
    }
    try {
      const updated = await api.updateSettings(payload);
      hydrate(updated);
      flash('Cambios guardados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await api.uploadLogo(file);
      setLogoTs(String(Date.now()));
      const data = await api.settings();
      setS(data);
      flash('Logo actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function testMail() {
    setError(null);
    try {
      const r = await api.testMail(f.email || undefined);
      flash(`Mail de prueba enviado a ${r.to}. Revisá la casilla.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el mail de prueba');
    }
  }

  if (loading) return <div className="empty"><span className="spinner" /> <span style={{ marginLeft: 8 }}>Cargando…</span></div>;

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 780 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Administración</div>
          <h1>Configuración</h1>
          <div className="sub">Empresa, notificaciones, agente de IA, WhatsApp y usuarios.</div>
        </div>
      </div>

      <ConfigTabs />

      {notice && <div className="card card-pad" style={okStyle}>{notice}</div>}
      {error && <div className="card card-pad" style={errStyle}>{error}</div>}

      {/* ---------------- Empresa ---------------- */}
      <section className="card">
        <div className="card-head"><h2>🏢 Empresa</h2></div>
        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={logoBox}>
              {s?.logo_path
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={api.logoUrl(logoTs || s.updated_at)} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>Sin logo</span>}
            </div>
            <div>
              <button className="btn" onClick={() => fileRef.current?.click()}>Subir logo</button>
              <input ref={fileRef} type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} />
              <p className="hint" style={{ marginTop: 6 }}>PNG o JPG. Se muestra en el formulario de inscripción del alumno.</p>
            </div>
          </div>
          <div style={grid2}>
            <Field label="Nombre / Razón social" value={f.empresa_nombre} onChange={(v) => set('empresa_nombre', v)} />
            <Field label="CUIT" value={f.cuit} onChange={(v) => set('cuit', v)} placeholder="30-12345678-9" />
          </div>
          <Field label="Domicilio" value={f.domicilio} onChange={(v) => set('domicilio', v)} />
          <div style={grid2}>
            <Field label="Email de la empresa" value={f.email} onChange={(v) => set('email', v)} type="email" />
            <Field label="Teléfono" value={f.telefono} onChange={(v) => set('telefono', v)} />
          </div>
          <div><button className="btn btn-primary" onClick={() => save('empresa')}>Guardar empresa</button></div>
        </div>
      </section>

      {/* ---------------- SMTP ---------------- */}
      <section className="card">
        <div className="card-head">
          <h2>✉️ Notificaciones por mail (SMTP)</h2>
          <span className={`badge ${s?.smtp_pass_set || s?.smtp_host ? 'badge-success' : 'badge'}`}>
            {s?.smtp_host ? 'configurado' : 'sin configurar'}
          </span>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          <p className="hint">Servidor con el que salen los mails de las notificaciones del sistema (pago, matriculación, etc.). Si se deja vacío, solo se notifica por WhatsApp.</p>
          <div style={grid2}>
            <Field label="Host SMTP" value={f.smtp_host} onChange={(v) => set('smtp_host', v)} placeholder="smtp.gmail.com" />
            <Field label="Puerto" value={f.smtp_port} onChange={(v) => set('smtp_port', v)} type="number" placeholder="587" />
          </div>
          <div style={grid2}>
            <Field label="Usuario" value={f.smtp_user} onChange={(v) => set('smtp_user', v)} placeholder="notificaciones@empresa.com" />
            <div className="field">
              <span className="label">Contraseña {s?.smtp_pass_set && <span style={{ color: 'var(--success)' }}>· guardada</span>}</span>
              <input className="input" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)}
                placeholder={s?.smtp_pass_set ? '•••••••• (dejar vacío para no cambiar)' : 'contraseña o app password'} />
            </div>
          </div>
          <div style={grid2}>
            <Field label="Remitente (From)" value={f.mail_from} onChange={(v) => set('mail_from', v)} placeholder="Escuela STOP <no-reply@empresa.com>" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end', fontSize: 14, paddingBottom: 8 }}>
              <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
              Conexión segura (SSL, puerto 465)
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => save('smtp')}>Guardar SMTP</button>
            <button className="btn" onClick={testMail}>Enviar mail de prueba</button>
          </div>
        </div>
      </section>

      {/* ---------------- Agente IA ---------------- */}
      <section className="card">
        <div className="card-head">
          <h2>🤖 Agente de IA</h2>
          <span className={`badge ${s?.ai_api_key_set ? 'badge-success' : 'badge'}`}>
            {s?.ai_api_key_set ? 'configurado' : 'sin configurar'}
          </span>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          <p className="hint">Credenciales y comportamiento del asistente de WhatsApp. La API key nunca se muestra: se guarda de forma segura y solo se reemplaza si escribís una nueva.</p>
          <div style={grid2}>
            <div className="field">
              <span className="label">API key del agente {s?.ai_api_key_set && <span style={{ color: 'var(--success)' }}>· guardada</span>}</span>
              <input className="input" type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)}
                placeholder={s?.ai_api_key_set ? '•••••••• (dejar vacío para no cambiar)' : 'sk-ant-...'} />
            </div>
            <Field label="Modelo" value={f.ai_model} onChange={(v) => set('ai_model', v)} placeholder="claude-sonnet-5" />
          </div>
          <div className="field">
            <span className="label">Instrucciones adicionales (opcional)</span>
            <textarea className="input" rows={5} value={f.ai_instrucciones} onChange={(e) => set('ai_instrucciones', e.target.value)}
              placeholder="Indicaciones extra para el asistente (tono, promociones vigentes, aclaraciones). No reemplaza las reglas base del agente." />
          </div>
          <div><button className="btn btn-primary" onClick={() => save('ai')}>Guardar agente</button></div>
        </div>
      </section>

      {s?.updated_at && (
        <p className="hint">Última actualización: {new Date(s.updated_at).toLocaleString('es-AR')}{s.updated_by ? ` · ${s.updated_by}` : ''}</p>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <input className="input" type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 };
const logoBox: React.CSSProperties = {
  width: 120, height: 90, border: '1px solid var(--border)', borderRadius: 12,
  display: 'grid', placeItems: 'center', background: 'var(--surface-2)', overflow: 'hidden', padding: 8,
};
const okStyle: React.CSSProperties = { color: 'var(--success)', background: 'var(--success-bg)', borderColor: 'var(--success-br)' };
const errStyle: React.CSSProperties = { color: 'var(--danger)', background: 'var(--danger-bg)', borderColor: 'var(--danger-br)' };
