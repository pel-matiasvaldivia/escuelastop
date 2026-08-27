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
  /** true = un operador tomó la conversación y el bot no responde. */
  bot_paused: boolean;
  bot_paused_at: string | null;
  updated_at: string;
}

export interface SucursalInfo {
  id: string;
  nombre: string;
  direccion?: string;
  activa: boolean;
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
  license_verified: boolean;
  form_token?: string;
  payment_status: 'pendiente' | 'aprobado' | 'rechazado';
  payment_amount: number | null;
  paid_at: string | null;
  updated_at: string;
}

export type DocumentKind = 'foto_licencia' | 'foto_dni' | 'apto_medico';

export interface StudentDocument {
  id: string;
  enrollment_id: string;
  kind: DocumentKind;
  mime_type: string | null;
  uploaded_at: string;
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
const USER_KEY = 'stop_user';

export type AdminRole = 'admin' | 'operador';

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  /** Sucursal del operador; null para el admin (ve todas). */
  sucursal: string | null;
  created_at?: string;
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
      window.localStorage.removeItem(USER_KEY);
    } catch {
      /* noop */
    }
  },
  isAuthenticated(): boolean {
    return !!this.getToken();
  },
  /** Usuario autenticado (rol + sucursal), cacheado del login para la UI. */
  getUser(): AdminUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch {
      return null;
    }
  },
  setUser(user: AdminUser): void {
    try {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* noop */
    }
  },
  isAdmin(): boolean {
    return this.getUser()?.role === 'admin';
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
    auth.setUser(data.user);
    return data;
  },

  logout(): void {
    auth.clearToken();
  },

  /** Refresca el usuario autenticado desde el backend (rol + sucursal). */
  async me(): Promise<AdminUser> {
    const user = await get<AdminUser>('/auth/me');
    auth.setUser(user);
    return user;
  },

  // --- Gestor de usuarios (solo admin) ---
  users: () => get<AdminUser[]>('/admin/users'),

  async createUser(data: {
    email: string; password: string; role: AdminRole; sucursal?: string | null;
  }): Promise<AdminUser> {
    const res = await fetch(`${API_URL}/api/admin/users`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    handle401(res);
    if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo crear el usuario');
    return res.json();
  },

  async updateUser(id: string, data: {
    role?: AdminRole; sucursal?: string | null; password?: string;
  }): Promise<AdminUser> {
    const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    handle401(res);
    if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo actualizar el usuario');
    return res.json();
  },

  async deleteUser(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    handle401(res);
    if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo eliminar el usuario');
  },

  /** Reasigna una inscripción a otra sucursal (solo admin). */
  async assignSucursal(enrollmentId: string, sede: string): Promise<Enrollment> {
    const res = await fetch(`${API_URL}/api/enrollments/${enrollmentId}/assign`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sede }),
    });
    handle401(res);
    if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo reasignar la sucursal');
    return res.json();
  },

  contacts: () => get<Contact[]>('/contacts'),
  enrollments: () => get<Enrollment[]>('/enrollments'),
  messages: (contactId: string) => get<Message[]>(`/contacts/${contactId}/messages`),
  catalog: () => get<Course[]>('/catalog'),
  /** Sucursales operativas (las inactivas no se ofrecen). */
  sucursales: () => get<SucursalInfo[]>('/catalog/sucursales'),
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
    return res.json() as Promise<{ checkoutUrl: string; formToken: string; simulated?: boolean }>;
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

  /** Handoff a humano: pausa o reanuda el bot para un contacto. */
  async setBotPaused(contactId: string, paused: boolean): Promise<Contact> {
    const res = await fetch(`${API_URL}/api/contacts/${contactId}/bot`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ paused }),
    });
    handle401(res);
    if (!res.ok) throw new Error('No se pudo cambiar el estado del bot');
    return res.json();
  },

  /** Carga manual de una inscripción (teléfono / mostrador). */
  async createManualEnrollment(data: {
    fullName: string; phone: string; email?: string; dni?: string;
    age?: number; courseId?: string; sede?: string; notes?: string;
    senaCobrada?: boolean;
  }) {
    const res = await fetch(`${API_URL}/api/enrollments/manual`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    });
    handle401(res);
    if (!res.ok) {
      throw new Error((await res.json()).error ?? 'No se pudo crear la inscripción');
    }
    return res.json() as Promise<{
      contact: Contact; enrollment: Enrollment; formUrl: string;
    }>;
  },

  // --- Ficha del alumno: inscripciones y documentos ---
  contactEnrollments: (contactId: string) =>
    get<Enrollment[]>(`/contacts/${contactId}/enrollments`),

  enrollmentDocuments: (enrollmentId: string) =>
    get<StudentDocument[]>(`/enrollments/${enrollmentId}/documents`),

  /**
   * URL para ver/descargar un documento. El token va en la query porque un
   * <img> no puede enviar el header Authorization.
   */
  documentUrl(documentId: string): string {
    return `${API_URL}/api/documents/${documentId}/file?token=${auth.getToken() ?? ''}`;
  },

  /** Aprueba o rechaza un caso de licencia pendiente de verificación. */
  async reviewLicense(enrollmentId: string, approve: boolean, note?: string) {
    const res = await fetch(`${API_URL}/api/enrollments/${enrollmentId}/license-review`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ approve, note }),
    });
    handle401(res);
    if (!res.ok) throw new Error('No se pudo registrar la revisión');
    return res.json() as Promise<Enrollment>;
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
