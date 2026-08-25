import { query } from '../db/index.js';

export type EnrollmentStatus =
  | 'nuevo' | 'contactado' | 'inscripto' | 'pagado' | 'completado' | 'cancelado';

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

export async function listEnrollments(status?: EnrollmentStatus): Promise<Enrollment[]> {
  if (status) {
    const res = await query<Enrollment>(
      'SELECT * FROM enrollments WHERE status = $1 ORDER BY updated_at DESC',
      [status],
    );
    return res.rows;
  }
  const res = await query<Enrollment>('SELECT * FROM enrollments ORDER BY updated_at DESC');
  return res.rows;
}

export async function getEnrollmentByToken(token: string): Promise<Enrollment | null> {
  const res = await query<Enrollment>('SELECT * FROM enrollments WHERE form_token = $1', [token]);
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
