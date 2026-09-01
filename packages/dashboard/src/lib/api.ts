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
  /** Cohorte en el que quedó matriculado (Fase 2), si corresponde. */
  training_course_id?: string | null;
  curso_nombre?: string | null;
  curso_fecha_inicio?: string | null;
  curso_cupo_maximo?: number | null;
  curso_activos?: number | null;
  /** La seña es un anticipo; pago_completo indica si se saldó el total. */
  pago_completo?: boolean;
  pago_completo_at?: string | null;
  updated_at: string;
}

/** Curso ABIERTO que el alumno puede elegir en el formulario (con su cupo). */
export interface OpenCourseOption {
  id: string;
  nombre: string;
  sede: string | null;
  fecha_inicio: string | null;
  cupo_maximo: number | null;
  activos: number;
  asientos_libres: number | null;
  completo: boolean;
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

// ------------------------------ Fase 2 -------------------------------------

export interface ExamCategory {
  key: string;
  nombre: string;
}

export interface ExamBank {
  id: string;
  categoria: string;
  nombre: string;
  descripcion: string | null;
  preguntas_por_examen: number;
  nota_minima: number;
  tiempo_limite_min: number;
  intentos_max: number;
  activo: boolean;
  preguntas: number;
}

export interface ExamQuestion {
  id: string;
  bank_id: string;
  enunciado: string;
  opciones: string[];
  correcta: number;
  orden: number;
}

export interface ExamTemplate {
  id: string;
  nombre: string;
  bank_id: string;
  preguntas_por_examen: number;
  nota_minima: number;
  tiempo_limite_min: number;
  intentos_max: number;
  activo: boolean;
  categoria?: string | null;
  banco_nombre?: string | null;
  preguntas_banco?: number;
}

export type TrainingEstado = 'abierto' | 'en_curso' | 'cerrado' | 'cancelado';

export interface TrainingCourse {
  id: string;
  nombre: string;
  course_id: string | null;
  bank_id: string | null;
  template_id: string | null;
  sede: string | null;
  instructor_id: string | null;
  instructor_email?: string | null;
  banco_categoria?: string | null;
  plantilla_nombre?: string | null;
  cupo_maximo: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: TrainingEstado;
  notas: string | null;
  alumnos?: number;
  activos?: number;
}

export type StudentEstado =
  | 'cursando' | 'teoria_aprobada' | 'teoria_desaprobada' | 'aprobado' | 'desaprobado' | 'baja';

export interface CourseStudent {
  id: string;
  training_course_id: string;
  full_name: string;
  dni: string;
  codigo: string;
  estado: StudentEstado;
  baja_motivo: string | null;
  baja_at: string | null;
  practica_aprobada: boolean | null;
  practica_rubrica: { item: string; ok: boolean }[] | null;
  practica_at: string | null;
}

export interface CourseClass {
  id: string;
  training_course_id: string;
  fecha: string;
  tema: string | null;
  presentes: number;
  ausentes: number;
}

export interface AttendanceRecord {
  course_student_id: string;
  presente: boolean;
}

export interface AttendanceSummary {
  course_student_id: string;
  presentes: number;
  ausentes: number;
}

export interface ExamSession {
  id: string;
  course_student_id: string;
  estado: 'habilitado' | 'en_curso' | 'entregado' | 'validado' | 'anulado';
  puntaje: number | null;
  aprobado: boolean | null;
  habilitado_at: string;
  entregado_at: string | null;
  validado_at: string | null;
}

export interface Certificate {
  id: string;
  serial: string;
  codigo_verif: string;
  emitido_por: string;
  emitido_at: string;
  anulado: boolean;
  datos: Record<string, unknown>;
  verifyUrl: string;
}

/** Pregunta como la ve el alumno en el kiosco (sin la respuesta correcta). */
export interface PresentedQuestion {
  id: string;
  enunciado: string;
  opciones: string[];
}

export interface ExamStart {
  sessionId: string;
  alumno: string;
  curso: string | null;
  tiempoLimiteMin: number | null;
  preguntas: PresentedQuestion[];
}

export type CertVerification =
  | { valido: true; anulado: boolean; serial: string; datos: Record<string, unknown>; emitido_at: string }
  | { valido: false };

// ------------------------------ Sesión -------------------------------------
const TOKEN_KEY = 'stop_token';
const USER_KEY = 'stop_user';

export type AdminRole = 'admin' | 'operador' | 'instructor';

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

/** Mutación autenticada con cuerpo JSON (POST/PATCH/DELETE). */
async function send<T>(
  path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: authHeaders(body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  handle401(res);
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  return res.json();
}

/** Igual que `send` pero sin autenticación (kiosco / verificación pública). */
async function sendPublic<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
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
  // method: 'checkout' (tarjeta/MP), 'rapipago' | 'pagofacil' (cupón en efectivo).
  async startPayment(
    token: string, courseId: string,
    opts: {
      contactId?: string; payerEmail?: string;
      method?: 'checkout' | 'rapipago' | 'pagofacil';
    } = {},
  ) {
    const res = await fetch(`${API_URL}/api/public/enrollment/${token}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, ...opts }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'Error iniciando el pago');
    return res.json() as Promise<{
      checkoutUrl?: string; ticketUrl?: string; formToken: string;
      simulated?: boolean; method?: string;
    }>;
  },

  async paymentStatus(token: string) {
    return get<{ payment_status: 'pendiente' | 'aprobado' | 'rechazado' }>(
      `/public/enrollment/${token}/payment-status`,
    );
  },

  /** Cursos ABIERTOS de una sucursal para el tipo de curso de la inscripción. */
  async availableCourses(token: string, sede: string) {
    const res = await fetch(
      `${API_URL}/api/public/enrollment/${token}/available-courses?sede=${encodeURIComponent(sede)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudieron cargar los cursos');
    return res.json() as Promise<OpenCourseOption[]>;
  },

  /**
   * Confirma la elección post-pago. Con `trainingCourseId` matricula al alumno
   * automáticamente en ese cohorte; sin él solo guarda la sucursal/turno.
   */
  async saveSchedule(token: string, data: {
    sede?: string; notes?: string; trainingCourseId?: string; fullName?: string; dni?: string;
  }) {
    const res = await fetch(`${API_URL}/api/public/enrollment/${token}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo guardar el turno');
    // Con matriculación automática, la inscripción queda con el pago pendiente de
    // completar (la seña es un anticipo); el código se habilita más adelante.
    return res.json() as Promise<Enrollment & {
      pago_pendiente?: boolean; saldo_pendiente?: number | null;
      curso_nombre?: string; curso_fecha_inicio?: string | null;
    }>;
  },

  /** Marca el pago total como completo y habilita el código del alumno. */
  async completePayment(enrollmentId: string): Promise<Enrollment> {
    const res = await fetch(`${API_URL}/api/enrollments/${enrollmentId}/complete-payment`, {
      method: 'POST',
      headers: authHeaders(),
    });
    handle401(res);
    if (!res.ok) throw new Error((await res.json()).error ?? 'No se pudo registrar el pago');
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

  // ============================ FASE 2 ============================

  // -- Metadatos y bancos --
  examCategories: () => get<ExamCategory[]>('/exam-categories'),
  instructores: () => get<AdminUser[]>('/instructores'),
  examBanks: () => get<ExamBank[]>('/exam-banks'),
  bankQuestions: (bankId: string) => get<ExamQuestion[]>(`/exam-banks/${bankId}/questions`),
  createBank: (data: {
    categoria: string; nombre: string; descripcion?: string;
    preguntasPorExamen?: number; notaMinima?: number; tiempoLimiteMin?: number; intentosMax?: number;
  }) => send<ExamBank>('/exam-banks', 'POST', data),
  addQuestion: (bankId: string, data: { enunciado: string; opciones: string[]; correcta: number }) =>
    send<ExamQuestion>(`/exam-banks/${bankId}/questions`, 'POST', data),
  importQuestions: (bankId: string, preguntas: { enunciado: string; opciones: string[]; correcta: number }[]) =>
    send<{ importadas: number }>(`/exam-banks/${bankId}/questions/bulk`, 'POST', { preguntas }),
  deleteQuestion: (id: string) => send<{ ok: boolean }>(`/exam-questions/${id}`, 'DELETE'),

  // -- Plantillas de examen --
  examTemplates: () => get<ExamTemplate[]>('/exam-templates'),
  createTemplate: (data: {
    nombre: string; bankId: string; preguntasPorExamen?: number; notaMinima?: number;
    tiempoLimiteMin?: number; intentosMax?: number;
  }) => send<ExamTemplate>('/exam-templates', 'POST', data),
  updateTemplate: (id: string, data: Partial<{
    nombre: string; bankId: string; preguntasPorExamen: number; notaMinima: number;
    tiempoLimiteMin: number; intentosMax: number; activo: boolean;
  }>) => send<ExamTemplate>(`/exam-templates/${id}`, 'PATCH', data),
  deleteTemplate: (id: string) => send<{ ok: boolean }>(`/exam-templates/${id}`, 'DELETE'),

  // -- Cursos --
  trainingCourses: () => get<TrainingCourse[]>('/training-courses'),
  trainingCourse: (id: string) =>
    get<{ course: TrainingCourse; alumnos: CourseStudent[] }>(`/training-courses/${id}`),
  createTrainingCourse: (data: {
    nombre: string; courseId?: string; bankId?: string; templateId?: string; sede?: string;
    instructorId?: string; cupoMaximo?: number | null; fechaInicio?: string; fechaFin?: string; notas?: string;
  }) => send<TrainingCourse>('/training-courses', 'POST', data),
  updateTrainingCourse: (id: string, data: Partial<{
    nombre: string; bank_id: string | null; template_id: string | null; sede: string | null;
    instructor_id: string | null; cupo_maximo: number | null; estado: TrainingEstado; notas: string | null;
  }>) => send<TrainingCourse>(`/training-courses/${id}`, 'PATCH', data),

  // -- Alumnos del curso --
  addStudent: (courseId: string, data: { fullName: string; dni: string }) =>
    send<CourseStudent>(`/training-courses/${courseId}/students`, 'POST', data),
  /** Baja del alumno (conserva historial, libera asiento). */
  bajaStudent: (id: string, motivo?: string) =>
    send<CourseStudent>(`/students/${id}/baja`, 'POST', { motivo }),
  /** Reactiva a un alumno dado de baja. */
  reactivarStudent: (id: string) => send<CourseStudent>(`/students/${id}/reactivar`, 'POST'),
  /** Borrado DEFINITIVO (solo admin; elimina el historial). */
  removeStudent: (id: string) => send<{ ok: boolean }>(`/students/${id}`, 'DELETE'),
  studentSessions: (id: string) => get<ExamSession[]>(`/students/${id}/sessions`),

  // -- Asistencia --
  courseClasses: (courseId: string) => get<CourseClass[]>(`/training-courses/${courseId}/classes`),
  createClass: (courseId: string, data: { fecha: string; tema?: string }) =>
    send<CourseClass>(`/training-courses/${courseId}/classes`, 'POST', data),
  deleteClass: (id: string) => send<{ ok: boolean }>(`/classes/${id}`, 'DELETE'),
  classAttendance: (classId: string) => get<AttendanceRecord[]>(`/classes/${classId}/attendance`),
  saveAttendance: (classId: string, records: { studentId: string; presente: boolean }[]) =>
    send<{ ok: boolean }>(`/classes/${classId}/attendance`, 'PUT', { records }),
  attendanceSummary: (courseId: string) =>
    get<AttendanceSummary[]>(`/training-courses/${courseId}/attendance-summary`),

  // -- Examen teórico --
  enableExam: (studentId: string) => send<ExamSession>(`/students/${studentId}/exam/enable`, 'POST'),
  validateExam: (sessionId: string) => send<ExamSession>(`/exam-sessions/${sessionId}/validate`, 'POST'),

  // -- Evaluación práctica --
  setPractica: (studentId: string, rubrica: { item: string; ok: boolean }[], aprobada: boolean) =>
    send<CourseStudent>(`/students/${studentId}/practica`, 'POST', { rubrica, aprobada }),

  // -- Certificado --
  issueCertificate: (studentId: string) => send<Certificate>(`/students/${studentId}/certificate`, 'POST'),
  getCertificate: (studentId: string) => get<Certificate>(`/students/${studentId}/certificate`),
  /** URL del PDF del certificado (token en la query para poder abrirlo con <a>). */
  certificatePdfUrl(studentId: string): string {
    return `${API_URL}/api/students/${studentId}/certificate/pdf?token=${auth.getToken() ?? ''}`;
  },

  // -- Kiosco público del examen (tablet del alumno) --
  examStart: (dni: string, codigo: string) =>
    sendPublic<ExamStart>('/public/exam/start', { dni, codigo }),
  examSubmit: (sessionId: string, dni: string, codigo: string, respuestas: number[]) =>
    sendPublic<{ entregado: boolean; puntaje: number; aprobado: boolean }>(
      `/public/exam/${sessionId}/submit`, { dni, codigo, respuestas },
    ),

  // -- Verificación pública del certificado (QR) --
  verifyCertificate: (codigo: string) => get<CertVerification>(`/public/verificar/${codigo}`),
};
