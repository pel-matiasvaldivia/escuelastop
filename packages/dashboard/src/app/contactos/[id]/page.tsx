'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, auth, UnauthorizedError, type Message, type Contact } from '../../../lib/api';
import FichaAlumno from '../../../components/FichaAlumno';

// Vista de conversación + contacto directo con el alumno desde el panel.
// En Next 14 `params` es un objeto plano (recién en 15 pasa a ser una Promise).
// Pasárselo a use() lanza el error de React #438 y rompe la página entera.
export default function ContactPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    try {
      const [msgs, contacts] = await Promise.all([api.messages(id), api.contacts()]);
      setMessages(msgs);
      setContact(contacts.find((c) => c.id === id) ?? null);
    } catch (err) {
      if (err instanceof UnauthorizedError) router.replace('/login');
    }
  }

  useEffect(() => {
    if (!auth.isAuthenticated()) {
      router.replace('/login');
      return;
    }
    load();
    const t = setInterval(load, 5000); // refresco simple; en producción usar websockets
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Handoff a humano: al enviar un mensaje el backend pausa el bot solo, pero
  // también se puede alternar a mano.
  async function toggleBot() {
    if (!contact) return;
    try {
      setContact(await api.setBotPaused(id, !contact.bot_paused));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo cambiar el bot');
    }
  }

  async function send() {
    if (!draft.trim() || !contact) return;
    setSending(true);
    try {
      await api.sendMessage(id, contact.wa_id, draft.trim());
      setDraft('');
      await load();
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <Link href="/">← Volver</Link>
      <h1 style={{ margin: '10px 0 4px' }}>{contact?.full_name ?? contact?.phone ?? 'Conversación'}</h1>
      {contact && (
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 0 }}>
          {contact.phone ?? '—'}
          {contact.dni && ` · DNI ${contact.dni}`}
          {contact.interest && ` · ${contact.interest}`}
        </p>
      )}

      <section style={{ margin: '20px 0 28px' }}>
        <h3 style={{ fontSize: 16, marginBottom: 10 }}>Inscripciones y documentos</h3>
        <FichaAlumno contactId={id} />
      </section>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 10, marginBottom: 10,
      }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>Conversación</h3>
        {contact && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`badge ${contact.bot_paused ? 'badge-warning' : 'badge-success'}`}>
              {contact.bot_paused ? '⏸️ Atiende un operador' : '🤖 Responde el bot'}
            </span>
            <button onClick={toggleBot} className="btn btn-sm">
              {contact.bot_paused ? 'Devolver al bot' : 'Tomar conversación'}
            </button>
          </div>
        )}
      </div>
      {contact?.bot_paused && (
        <p style={{ fontSize: 13, color: '#9a3412', marginTop: 0 }}>
          El bot no está respondiendo a este contacto. Los mensajes que llegan
          quedan registrados acá para que los conteste una persona.
        </p>
      )}

      <div className="card" style={{
        padding: 16, height: 420, overflowY: 'auto', display: 'flex',
        flexDirection: 'column', gap: 8,
      }}>
        {messages.map((m) => (
          <div key={m.id} style={{
            alignSelf: m.direction === 'inbound' ? 'flex-start' : 'flex-end',
            maxWidth: '75%',
          }}>
            <div style={{
              background: m.direction === 'inbound' ? 'var(--surface-3)'
                : m.sender === 'agent' ? 'var(--info-bg)' : 'var(--success-bg)',
              padding: '8px 12px', borderRadius: 10, fontSize: 14, whiteSpace: 'pre-wrap',
            }}>
              {m.body}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 2 }}>
              {m.sender === 'bot' ? '🤖 bot' : m.sender === 'agent' ? '👤 operador' : ''}{' '}
              {new Date(m.created_at).toLocaleTimeString('es-AR')}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Escribir un mensaje al alumno…"
          style={{ flex: 1 }}
        />
        <button onClick={send} disabled={sending} className="btn btn-success">
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted-2)', marginTop: 6 }}>
        Nota: con la API oficial de WhatsApp, fuera de la ventana de 24 hs solo se
        pueden enviar plantillas aprobadas por Meta.
      </p>
    </div>
  );
}
