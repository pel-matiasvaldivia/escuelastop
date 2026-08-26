'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, auth, UnauthorizedError, type WhatsAppStatus } from '../../lib/api';

/**
 * Vinculación del número de WhatsApp: muestra el QR para escanear desde el
 * celular y el estado de la conexión (polling cada 2s mientras no esté listo).
 */
export default function WhatsAppPage() {
  const router = useRouter();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.whatsappStatus());
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        router.replace('/login');
        return;
      }
      setError('No se pudo consultar el estado. ¿Está corriendo el backend?');
    }
  }, [router]);

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace('/login');
      return;
    }
    load();
    timer.current = setInterval(load, 2000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load, router]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.whatsappConnect());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conectar');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (!confirm('¿Limpiar la sesión? Vas a tener que escanear el QR de nuevo.')) return;
    setBusy(true);
    setError(null);
    try {
      setStatus(await api.whatsappLogout());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al desvincular');
    } finally {
      setBusy(false);
    }
  }

  const state = status?.state ?? 'apagado';

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 640 }}>
      <div>
        <h2 style={{ margin: 0 }}>Vincular WhatsApp</h2>
        <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
          Conectá el número desde el que responde el agente a los alumnos.
        </p>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <StateBadge state={state} />
          {status && (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              actualizado {new Date(status.updatedAt).toLocaleTimeString('es-AR')}
            </span>
          )}
        </div>

        {error && <p style={{ color: '#b91c1c', fontSize: 14 }}>{error}</p>}

        {/* --- QR listo para escanear --- */}
        {state === 'qr' && status?.qr && (
          <div style={{ textAlign: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={status.qr}
              alt="Código QR para vincular WhatsApp"
              style={{
                width: 280, height: 280, imageRendering: 'pixelated',
                border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
              }}
            />
            <ol style={instructions}>
              <li>Abrí <strong>WhatsApp</strong> en el celular del número de la escuela.</li>
              <li>Tocá <strong>Configuración → Dispositivos vinculados</strong>.</li>
              <li>Tocá <strong>Vincular un dispositivo</strong> y escaneá este código.</li>
            </ol>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>
              El código se renueva solo. Después de escanear, no cierres el servicio
              por unos minutos para que la sesión quede guardada.
            </p>
          </div>
        )}

        {state === 'iniciando' && (
          <p style={{ color: '#475569' }}>
            Abriendo WhatsApp Web… el código QR aparece en unos segundos.
          </p>
        )}

        {state === 'conectado' && (
          <p style={{ color: '#15803d', fontWeight: 600 }}>
            ✅ El número está vinculado. El agente ya responde los mensajes entrantes.
          </p>
        )}

        {state === 'apagado' && (
          <p style={{ color: '#475569' }}>
            El canal está apagado. Tocá <strong>Vincular WhatsApp</strong> para generar el QR.
          </p>
        )}

        {state === 'error' && (
          <div>
            <p style={{ color: '#b91c1c', fontWeight: 600, marginBottom: 4 }}>
              No se pudo iniciar el canal.
            </p>
            <pre style={errorBox}>{status?.error}</pre>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Probá <strong>Limpiar sesión</strong> y volvé a vincular: un perfil de
              navegador a medio cerrar suele causar esto. Si persiste, revisá los
              logs del backend.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {state !== 'conectado' && (
            <button onClick={connect} disabled={busy || state === 'iniciando'} style={primaryBtn}>
              {state === 'qr' ? 'Regenerar QR' : 'Vincular WhatsApp'}
            </button>
          )}
          {state !== 'iniciando' && (
            <button onClick={logout} disabled={busy} style={dangerBtn}>
              {state === 'conectado' ? 'Desvincular' : 'Limpiar sesión'}
            </button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#94a3b8' }}>
        Nota: la integración usa WhatsApp Web (no oficial). Para producción a escala
        conviene migrar a la API oficial de Meta.
      </p>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; color: string }> = {
    apagado: { label: 'Desconectado', color: '#64748b' },
    iniciando: { label: 'Iniciando…', color: '#0891b2' },
    qr: { label: 'Esperando escaneo', color: '#ea580c' },
    conectado: { label: 'Conectado', color: '#16a34a' },
    error: { label: 'Error', color: '#dc2626' },
  };
  const s = map[state] ?? map.apagado;
  return (
    <span style={{
      background: s.color, color: '#fff', padding: '3px 12px',
      borderRadius: 12, fontSize: 12, fontWeight: 600,
    }}>
      {s.label}
    </span>
  );
}

const card = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24,
} as const;
const instructions = {
  textAlign: 'left' as const, fontSize: 14, color: '#334155',
  margin: '18px auto 10px', maxWidth: 380, lineHeight: 1.7,
};
const errorBox = {
  background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10,
  fontSize: 12, color: '#991b1b', whiteSpace: 'pre-wrap' as const, overflowX: 'auto' as const,
};
const primaryBtn = {
  padding: '10px 20px', background: '#0f172a', color: '#fff', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 600,
} as const;
const dangerBtn = {
  padding: '10px 20px', background: '#fff', color: '#dc2626',
  border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer', fontSize: 15,
} as const;
