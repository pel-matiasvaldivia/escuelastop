const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface Contact {
  id: string;
  wa_id: string;
  phone: string | null;
  full_name: string | null;
  dni: string | null;
  age: number | null;
  preferred_sede: string | null;
  interest: string | null;
  consent_given: boolean;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  contact_id: string;
  course: string | null;
  sede: string | null;
  status: string;
  notes: string | null;
  updated_at: string;
}

export interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  sender: 'user' | 'bot' | 'agent';
  body: string;
  created_at: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Error ${res.status} en ${path}`);
  return res.json();
}

export const api = {
  contacts: () => get<Contact[]>('/contacts'),
  enrollments: () => get<Enrollment[]>('/enrollments'),
  messages: (contactId: string) => get<Message[]>(`/contacts/${contactId}/messages`),

  async sendMessage(contactId: string, waId: string, body: string): Promise<void> {
    await fetch(`${API_URL}/api/contacts/${contactId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waId, body }),
    });
  },

  async updateEnrollment(id: string, status: string): Promise<void> {
    await fetch(`${API_URL}/api/enrollments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  },
};
