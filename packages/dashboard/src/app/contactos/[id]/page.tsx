'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, auth, UnauthorizedError, type Message, type Contact } from '../../../lib/api';
import FichaAlumno from '../../../components/FichaAlumno';

// Vista de conversación + contacto directo con el alumno desde el panel.
export default function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
      <Link href="/" style={{ color: '#2563eb' }}>← Volver</Link>
      <h2 style={{ marginBottom: 4 }}>{contact?.full_name ?? contact?.phone ?? 'Conversación'}</h2>
      {contact && (
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 0 }}>
          {contact.phone ?? '—'}
          {contact.dni && ` · DNI ${contact.dni}`}
          {contact.interest && ` · ${contact.interest}`}
        </p>
      )}

      <section style={{ margin: '20px 0 28px' }}>
        <h3 style={{ fontSize: 16, marginBottom: 10 }}>Inscripciones y documentos</h3>
        <FichaAlumno contactId={id} />
      </section>

      <h3 style={{ fontSize: 16, marginBottom: 10 }}>Conversación</h3>

      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: 16, height: 420, overflowY: 'auto', display: 'flex',
        flexDirection: 'column', gap: 8,
      }}>
        {messages.map((m) => (
          <div key={m.id} style={{
            alignSelf: m.direction === 'inbound' ? 'flex-start' : 'flex-end',
            maxWidth: '75%',
          }}>
            <div style={{
              background: m.direction === 'inbound' ? '#f1f5f9'
                : m.sender === 'agent' ? '#dbeafe' : '#dcfce7',
              padding: '8px 12px', borderRadius: 10, fontSize: 14, whiteSpace: 'pre-wrap',
            }}>
              {m.body}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {m.sender === 'bot' ? '🤖 bot' : m.sender === 'agent' ? '👤 operador' : ''}{' '}
              {new Date(m.created_at).toLocaleTimeString('es-AR')}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Escribir un mensaje al alumno…"
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }}
        />
        <button
          onClick={send}
          disabled={sending}
          style={{
            padding: '10px 20px', background: '#16a34a', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
          }}
        >
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
        Nota: con la API oficial de WhatsApp, fuera de la ventana de 24 hs solo se
        pueden enviar plantillas aprobadas por Meta.
      </p>
    </div>
  );
}
