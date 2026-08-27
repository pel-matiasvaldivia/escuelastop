import { query } from '../db/index.js';

export type EnrollmentStatus =
  | 'nuevo' | 'contactado' | 'inscripto' | 'pagado' | 'completado' | 'cancelado'
  | 'pendiente_verificacion';

export type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';

export interface Enrollment {
  id: string;
  contact_id: string;
  course: string | null;
  sede: string | null;
  status: EnrollmentStatus;
  form_token: string;
  notes: string | null;
  license_expiry: string | null;
  license_status: 'vigente' | 'proxima' | 'vencida' | null;
  /** Administración revisó y habilitó una licencia vencida/próxima a vencer. */
  license_verified: boolean;
  payment_status: PaymentStatus;
  payment_id: string | null;
  payment_amount: number | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function createEnrollment(
  contactId: string,
  course?: string,
  sede?: string,
): Promise<Enrollment> {
  const res = await query<Enrollment>(
    `INSERT INTO enrollments (contact_id, course, sede) VALUES ($1, $2, $3) RETURNING *`,
    [contactId, course ?? null, sede ?? null],
  );
  return res.rows[0];
}

/**
 * Lista inscripciones para el panel.
 * - `status`: filtro opcional por estado.
 * - `sucursal`: scoping por sucursal (operadores). Cuando se pasa, solo devuelve
 *   inscripciones YA asignadas a esa sede. En el embudo online la sede recién se
 *   guarda cuando el alumno pagó la seña y eligió turno (estado 'inscripto'), así
 *   que filtrar por sede equivale a "proceso completo". El admin no pasa sucursal
 *   y ve todo.
 */
export async function listEnrollments(
  opts: { status?: EnrollmentStatus; sucursal?: string | null } = {},
): Promise<Enrollment[]> {
  const conds: string[] = [];
  const values: unknown[] = [];
  if (opts.status) {
    values.push(opts.status);
    conds.push(`status = $${values.length}`);
  }
  if (opts.sucursal !== undefined && opts.sucursal !== null) {
    values.push(opts.sucursal);
    conds.push(`sede = $${values.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const res = await query<Enrollment>(
    `SELECT * FROM enrollments ${where} ORDER BY updated_at DESC`,
    values,
  );
  return res.rows;
}

/** ¿La inscripción pertenece a esta sucursal? (autorización de operadores). */
export async function enrollmentInSucursal(id: string, sucursal: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    'SELECT TRUE AS ok FROM enrollments WHERE id = $1 AND sede = $2',
    [id, sucursal],
  );
  return res.rows.length > 0;
}

/**
 * Reasigna una inscripción a otra sucursal (solo admin). Deja constancia en las
 * notas de quién y cuándo hizo el cambio.
 */
export async function assignSucursal(
  id: string, sede: string, reviewer: string,
): Promise<Enrollment | null> {
  const stamp = new Date().toISOString().slice(0, 10);
  const note = `🏢 Reasignada a la sucursal ${sede} por ${reviewer} (${stamp})`;
  const res = await query<Enrollment>(
    `UPDATE enrollments
     SET sede = $2,
         notes = COALESCE(notes || E'\\n', '') || $3,
         updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, sede, note],
  );
  return res.rows[0] ?? null;
}

export async function getEnrollmentByToken(token: string): Promise<Enrollment | null> {
  const res = await query<Enrollment>('SELECT * FROM enrollments WHERE form_token = $1', [token]);
  return res.rows[0] ?? null;
}

/** Inscripciones de un contacto (para la ficha del alumno en el panel). */
export async function listEnrollmentsByContact(contactId: string): Promise<Enrollment[]> {
  const res = await query<Enrollment>(
    'SELECT * FROM enrollments WHERE contact_id = $1 ORDER BY created_at DESC',
    [contactId],
  );
  return res.rows;
}

/**
 * Resolución manual de un caso de licencia por administración.
 * - aprobar:  habilita continuar al pago aunque la licencia esté vencida.
 * - rechazar: cancela el trámite.
 * En ambos casos se deja constancia en las notas.
 */
export async function resolveLicenseReview(
  id: string,
  approve: boolean,
  reviewer: string,
  note?: string,
): Promise<Enrollment | null> {
  const stamp = new Date().toISOString().slice(0, 10);
  const detail = note?.trim() ? ` — ${note.trim()}` : '';
  const entry = approve
    ? `✅ Licencia verificada y habilitada por ${reviewer} (${stamp})${detail}`
    : `❌ Trámite rechazado por ${reviewer} (${stamp})${detail}`;

  const res = await query<Enrollment>(
    `UPDATE enrollments
     SET license_verified = $2,
         status = CASE WHEN $2 THEN 'contactado' ELSE 'cancelado' END,
         notes = COALESCE(notes || E'\\n', '') || $3,
         updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, approve, entry],
  );
  return res.rows[0] ?? null;
}

export async function getEnrollmentById(id: string): Promise<Enrollment | null> {
  const res = await query<Enrollment>('SELECT * FROM enrollments WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

/**
 * Guarda la evaluación de la licencia. Si requiere verificación humana, deja la
 * inscripción en 'pendiente_verificacion' para que administración tome el caso.
 */
export async function setLicenseInfo(
  id: string,
  expiry: string,
  licenseStatus: 'vigente' | 'proxima' | 'vencida',
  needsReview: boolean,
  note?: string,
): Promise<Enrollment> {
  const res = await query<Enrollment>(
    `UPDATE enrollments
     SET license_expiry = $2,
         license_status = $3,
         status = CASE WHEN $4 THEN 'pendiente_verificacion' ELSE status END,
         notes = CASE WHEN $5::text IS NOT NULL
                      THEN COALESCE(notes || E'\\n', '') || $5 ELSE notes END,
         updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, expiry, licenseStatus, needsReview, note ?? null],
  );
  return res.rows[0];
}

/**
 * Registra una seña cobrada fuera del sistema (efectivo o transferencia en la
 * sucursal). Deja el pago aprobado para que la inscripción pueda avanzar a
 * sucursal/turno igual que si se hubiera pagado online.
 */
export async function registerManualPayment(
  id: string, amount: number, reviewer: string,
): Promise<Enrollment | null> {
  const stamp = new Date().toISOString().slice(0, 10);
  const note = `💵 Seña de $${amount.toLocaleString('es-AR')} cobrada fuera del sistema, ` +
    `registrada por ${reviewer} (${stamp})`;
  const res = await query<Enrollment>(
    `UPDATE enrollments
     SET payment_status = 'aprobado', payment_amount = $2, paid_at = now(),
         status = 'pagado',
         notes = COALESCE(notes || E'\\n', '') || $3,
         updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, amount, note],
  );
  return res.rows[0] ?? null;
}

/** Registra el intento de pago (id del proveedor + monto de la seña). */
export async function setPaymentPending(
  id: string, paymentId: string, amount: number,
): Promise<Enrollment> {
  const res = await query<Enrollment>(
    `UPDATE enrollments
     SET payment_id = $2, payment_amount = $3, payment_status = 'pendiente', updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, paymentId, amount],
  );
  return res.rows[0];
}

/**
 * Confirma (o rechaza) el pago identificado por payment_id. Cuando se aprueba,
 * marca paid_at y mueve el estado de la inscripción a 'pagado'. Este es el GATE:
 * recién con payment_status = 'aprobado' el formulario habilita sucursal/turno.
 */
export async function applyPaymentStatus(
  paymentId: string, status: PaymentStatus,
): Promise<Enrollment | null> {
  const res = await query<Enrollment>(
    `UPDATE enrollments
     SET payment_status = $2,
         paid_at = CASE WHEN $2 = 'aprobado' THEN now() ELSE paid_at END,
         status  = CASE WHEN $2 = 'aprobado' THEN 'pagado' ELSE status END,
         updated_at = now()
     WHERE payment_id = $1 RETURNING *`,
    [paymentId, status],
  );
  return res.rows[0] ?? null;
}

/**
 * Guarda sucursal/turno SOLO si el pago está aprobado. Devuelve null si el gate
 * no está cumplido (pago pendiente/rechazado).
 */
export async function saveScheduleAfterPayment(
  token: string, sede: string | null, notes: string | null,
): Promise<Enrollment | null> {
  const res = await query<Enrollment>(
    `UPDATE enrollments
     SET sede = $2, notes = COALESCE($3, notes), status = 'inscripto', updated_at = now()
     WHERE form_token = $1 AND payment_status = 'aprobado' RETURNING *`,
    [token, sede, notes],
  );
  return res.rows[0] ?? null;
}

export async function updateEnrollment(
  id: string,
  fields: Partial<Pick<Enrollment, 'course' | 'sede' | 'status' | 'notes'>>,
): Promise<Enrollment> {
  const allowed: (keyof typeof fields)[] = ['course', 'sede', 'status', 'notes'];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (sets.length === 0) {
    const res = await query<Enrollment>('SELECT * FROM enrollments WHERE id = $1', [id]);
    return res.rows[0];
  }
  values.push(id);
  const res = await query<Enrollment>(
    `UPDATE enrollments SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  return res.rows[0];
}
