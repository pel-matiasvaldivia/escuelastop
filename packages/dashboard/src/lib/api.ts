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

export type FormFieldKey =
  | 'nombre' | 'dni' | 'edad' | 'email' | 'telefono'
  | 'sucursal' | 'turno' | 'foto_licencia' | 'foto_dni' | 'apto_medico';

export interface Schedule {
  id: string;
  sucursal: string;
  turno: string;
  dias: string;
  horario: string;
}

export interface Course {
  id: string;
  name: string;
  category: string;
  price: number | null;
  priceNote?: string;
  description?: string;
  includes?: string[];
  schedules?: Schedule[];
  requiredFields: FormFieldKey[];
  requiredDocs?: string[];
  notes?: string[];
  contactSucursal?: boolean;
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
  catalog: () => get<Course[]>('/catalog'),
  enrollmentByToken: (token: string) => get<Enrollment>(`/public/enrollment/${token}`),

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
