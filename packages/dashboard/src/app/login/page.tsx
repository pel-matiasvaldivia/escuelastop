'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

// Pantalla de inicio de sesión del panel de administración.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.login(email.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: 'calc(100vh - var(--header-h) - 92px)', display: 'grid', placeItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={logoMark} aria-hidden>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: 'inset 0 0 0 5px #b91c1c' }} />
          </div>
          <h1 style={{ margin: '14px 0 2px', fontSize: 22 }}>Escuela de Manejo STOP</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>Panel de administración</p>
        </div>

        <form onSubmit={onSubmit} className="card card-pad" style={{ display: 'grid', gap: 16, padding: 26, boxShadow: 'var(--shadow)' }}>
          <div className="field">
            <label className="label">Email</label>
            <input
              type="email" className="input" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus
              placeholder="admin@escuelastop.com.ar"
            />
          </div>

          <div className="field">
            <label className="label">Contraseña</label>
            <input
              type="password" className="input" value={password}
              onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="badge badge-danger" style={{ justifyContent: 'flex-start', padding: '8px 12px', borderRadius: 10 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn btn-primary btn-lg btn-block">
            {busy ? <><span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.4)' }} /> Ingresando…</> : 'Ingresar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: 'var(--muted-2)', fontSize: 12, marginTop: 16 }}>
          Acceso restringido al personal autorizado.
        </p>
      </div>
    </div>
  );
}

const logoMark: React.CSSProperties = {
  width: 54, height: 54, borderRadius: 16, margin: '0 auto', display: 'grid', placeItems: 'center',
  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
  boxShadow: '0 10px 30px -8px rgba(239,68,68,0.5)',
};
