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
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <form
        onSubmit={onSubmit}
        style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          padding: 28, width: '100%', maxWidth: 360, display: 'grid', gap: 14,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Ingresar</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Panel de administración — STOP
          </p>
        </div>

        <label style={labelStyle}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        {error && <p style={{ color: '#b91c1c', margin: 0, fontSize: 14 }}>{error}</p>}

        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '11px 20px', background: '#0f172a', color: '#fff', border: 'none',
            borderRadius: 8, cursor: busy ? 'default' : 'pointer', fontSize: 15, fontWeight: 600,
          }}
        >
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

const labelStyle = { display: 'grid', gap: 6, fontSize: 14, color: '#334155' } as const;
const inputStyle = {
  padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 15,
} as const;
