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
  license_expiry: string | null;
  license_status: 'vigente' | 'proxima' | 'vencida' | null;
  payment_status: 'pendiente' | 'aprobado' | 'rechazado';
  payment_amount: number | null;
  paid_at: string | null;
  updated_at: string;
}

export type ChannelState = 'apagado' | 'iniciando' | 'qr' | 'conectado' | 'error';

export interface WhatsAppStatus {
  state: ChannelState;
  qr: string | null;
  error: string | null;
  updatedAt: string;
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
  seniaReserva?: number | null;
  description?: string;
  includes?: string[];
  schedules?: Schedule[];
  requiredFields: FormFieldKey[];
  requiredDocs?: string[];
  notes?: string[];
  contactSucursal?: boolean;
}

// ------------------------------ Sesión -------------------------------------
const TOKEN_KEY = 'stop_token';

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'operador';
}

export const auth = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setToken(token: string): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* almacenamiento no disponible */
    }
  },
  clearToken(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* noop */
    }
  },
  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};

/** Error lanzado cuando el token es inválido o expiró (HTTP 401). */
export class UnauthorizedError extends Error {
  constructor() {
    super('No autorizado');
    this.name = 'UnauthorizedError';
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = auth.getToken();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

function handle401(res: Response): void {
  if (res.status === 401) {
    auth.clearToken();
    throw new UnauthorizedError();
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    cache: 'no-store',
    headers: authHeaders(),
  });
  handle401(res);
  if (!res.ok) throw new Error(`Error ${res.status} en ${path}`);
  return res.json();
}

export const api = {
  // --- Autenticación ---
  async login(email: string, password: string): Promise<{ token: string; user: AdminUser }> {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 401) throw new Error('Email o contraseña incorrectos');
    if (!res.ok) throw new Error('No se pudo iniciar sesión');
    const data = (await res.json()) as { token: string; user: AdminUser };
    auth.setToken(data.token);
    return data;
  },

  logout(): void {
    auth.clearToken();
  },

  contacts: () => get<Contact[]>('/contacts'),
  enrollments: () => get<Enrollment[]>('/enrollments'),
  messages: (contactId: string) => get<Message[]>(`/contacts/${contactId}/messages`),
  catalog: () => get<Course[]>('/catalog'),
  enrollmentByToken: (token: string) => get<Enrollment>(`/public/enrollment/${token}`),

  // --- Paso 1: datos personales + fotos (multipart) ---
  async submitDetails(token: string, form: FormData) {
    const res = await fetch(`${API_URL}/api/public/enrollment/${token}/details`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error('No se pudieron guardar los datos');
    return res.json() as Promise<{
      ok: boolean;
      licenseReview?: boolean;
      licenseStatus?: 'vigente' | 'proxima' | 'vencida';
      daysToExpiry?: number;
    }>;
  },

  // --- Pago de la seña (gate) ---
  async startPayment(token: string, courseId: string, contactId?: string, payerEmail?: string) {
    const res = await fetch(`${API_URL}/api/public/enrollment/${token}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, contactId, payerEmail }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'Error iniciando el pago');
    return res.json() as Promise<{ checkoutUrl: string; formToken: string }>;
  },

  async paymentStatus(token: string) {
    return get<{ payment_status: 'pendiente' | 'aprobado' | 'rechazado' }>(
      `/public/enrollment/${token}/payment-status`,
    );
  },

  async saveSchedule(token: string, sede: string, notes: string) {
    const res = await fetch(`${API_URL}/api/public/enrollment/${token}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sede, notes }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo guardar el turno');
    return res.json();
  },

  // --- WhatsApp: vinculación por QR ---
  whatsappStatus: () => get<WhatsAppStatus>('/whatsapp/status'),

  async whatsappConnect(): Promise<WhatsAppStatus> {
    const res = await fetch(`${API_URL}/api/whatsapp/connect`, {
      method: 'POST',
      headers: authHeaders(),
    });
    handle401(res);
    if (!res.ok) throw new Error('No se pudo iniciar la vinculación');
    return res.json();
  },

  async whatsappLogout(): Promise<WhatsAppStatus> {
    const res = await fetch(`${API_URL}/api/whatsapp/logout`, {
      method: 'POST',
      headers: authHeaders(),
    });
    handle401(res);
    if (!res.ok) throw new Error('No se pudo cerrar la sesión de WhatsApp');
    return res.json();
  },

  async sendMessage(contactId: string, waId: string, body: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/contacts/${contactId}/messages`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ waId, body }),
    });
    handle401(res);
  },

  async updateEnrollment(id: string, status: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/enrollments/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    });
    handle401(res);
  },
};
