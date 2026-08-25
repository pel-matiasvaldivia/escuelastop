import { query } from '../db/index.js';
import type { ChatTurn } from '../agent/agent.js';

export interface Message {
  id: string;
  contact_id: string;
  direction: 'inbound' | 'outbound';
  sender: 'user' | 'bot' | 'agent';
  body: string;
  created_at: string;
}

export async function saveMessage(
  contactId: string,
  direction: Message['direction'],
  sender: Message['sender'],
  body: string,
): Promise<Message> {
  const res = await query<Message>(
    `INSERT INTO messages (contact_id, direction, sender, body)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [contactId, direction, sender, body],
  );
  return res.rows[0];
}

export async function getConversation(contactId: string): Promise<Message[]> {
  const res = await query<Message>(
    'SELECT * FROM messages WHERE contact_id = $1 ORDER BY created_at ASC',
    [contactId],
  );
  return res.rows;
}

/** Devuelve el historial en el formato que consume el agente (últimos N turnos). */
export async function getChatHistory(contactId: string, limit = 20): Promise<ChatTurn[]> {
  const res = await query<Message>(
    'SELECT * FROM messages WHERE contact_id = $1 ORDER BY created_at DESC LIMIT $2',
    [contactId, limit],
  );
  return res.rows
    .reverse()
    .map((m) => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.body,
    }));
}
