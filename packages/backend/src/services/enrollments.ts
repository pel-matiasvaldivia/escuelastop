import { query } from '../db/index.js';

export type EnrollmentStatus =
  | 'nuevo' | 'contactado' | 'inscripto' | 'pagado' | 'completado' | 'cancelado'
  | 'pendiente_verificacion' | 'preinscripto';

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
  /** Cohorte (training_courses) en el que quedó matriculado tras pagar/elegir. */
  training_course_id: string | null;
  /** true = se completó el pago total (la seña es solo un anticipo). */
  pago_completo: boolean;
  pago_completo_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Inscripción con datos del cohorte para el panel: administración ve, en la misma
 * fila, en qué curso quedó matriculado el alumno, cuándo empieza y cómo está el
 * cupo (asientos ocupados / máximo).
 */
export interface EnrollmentView extends Enrollment {
  curso_nombre: string | null;
  curso_fecha_inicio: string | null;
  curso_cupo_maximo: number | null;
  curso_activos: number | null;
  /** Datos del alumno (contacto) para la bandeja. */
  alumno_nombre: string | null;
  alumno_dni: string | null;
  alumno_telefono: string | null;
}

export interface EnrollmentListOpts {
  status?: EnrollmentStatus;
  sucursal?: string | null;
  /** Búsqueda por nombre, DNI o curso. */
  q?: string;
  /** Filtro por nombre de curso exacto (del catálogo). */
  course?: string;
  /** Rango por fecha de inscripción (created_at), en formato YYYY-MM-DD. */
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

export interface EnrollmentListResult {
  rows: EnrollmentView[];
  total: number;
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
  opts: EnrollmentListOpts = {},
): Promise<EnrollmentListResult> {
  const conds: string[] = [];
  const values: unknown[] = [];
  if (opts.status) {
    values.push(opts.status);
    conds.push(`e.status = $${values.length}`);
  }
  if (opts.sucursal !== undefined && opts.sucursal !== null) {
    values.push(opts.sucursal);
    conds.push(`e.sede = $${values.length}`);
  }
  if (opts.q && opts.q.trim()) {
    values.push(`%${opts.q.trim()}%`);
    const i = values.length;
    conds.push(`(c.full_name ILIKE $${i} OR c.dni ILIKE $${i} OR c.phone ILIKE $${i} OR e.course ILIKE $${i})`);
  }
  if (opts.course && opts.course.trim()) {
    values.push(opts.course.trim());
    conds.push(`e.course = $${values.length}`);
  }
  if (opts.desde) {
    values.push(opts.desde);
    conds.push(`e.created_at >= $${values.length}::date`);
  }
  if (opts.hasta) {
    values.push(opts.hasta);
    // inclusive del día "hasta": < día siguiente.
    conds.push(`e.created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  values.push(limit); const limIdx = values.length;
  values.push(offset); const offIdx = values.length;

  const res = await query<EnrollmentView & { curso_activos: string | null; total_count: string }>(
    `SELECT e.*,
            c.full_name     AS alumno_nombre,
            c.dni           AS alumno_dni,
            c.phone         AS alumno_telefono,
            tc.nombre       AS curso_nombre,
            tc.fecha_inicio AS curso_fecha_inicio,
            tc.cupo_maximo  AS curso_cupo_maximo,
            (SELECT COUNT(*) FROM course_students cs
              WHERE cs.training_course_id = tc.id AND cs.estado <> 'baja') AS curso_activos,
            COUNT(*) OVER() AS total_count
       FROM enrollments e
       LEFT JOIN contacts c ON c.id = e.contact_id
       LEFT JOIN training_courses tc ON tc.id = e.training_course_id
       ${where}
      ORDER BY e.updated_at DESC
      LIMIT $${limIdx} OFFSET $${offIdx}`,
    values,
  );
  const total = res.rows[0] ? Number(res.rows[0].total_count) : 0;
  const rows = res.rows.map((r) => ({
    ...r,
    curso_activos: r.curso_activos == null ? null : Number(r.curso_activos),
  }));
  return { rows, total };
}

/**
 * Marca el pago total como completo (administración cobró el saldo presencial).
 * Recién con esto se habilita el código del alumno para rendir. Deja constancia
 * en las notas. Idempotente: si ya estaba completo, no vuelve a anotar.
 */
export async function completeEnrollmentPayment(
  id: string, reviewer: string,
): Promise<{ enrollment: Enrollment; changed: boolean } | null> {
  const current = await getEnrollmentById(id);
  if (!current) return null;
  if (current.pago_completo) return { enrollment: current, changed: false };

  const stamp = new Date().toISOString().slice(0, 10);
  const note = `💰 Pago total completado, registrado por ${reviewer} (${stamp})`;
  const res = await query<Enrollment>(
    `UPDATE enrollments
        SET pago_completo = TRUE, pago_completo_at = now(),
            status = 'pagado',
            notes = COALESCE(notes || E'\\n', '') || $2,
            updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, note],
  );
  return res.rows[0] ? { enrollment: res.rows[0], changed: true } : null;
}

/** Vincula la inscripción al cohorte en el que quedó matriculada. */
export async function setEnrollmentTrainingCourse(
  id: string, trainingCourseId: string, sede: string | null, notes: string | null,
): Promise<Enrollment | null> {
  const res = await query<Enrollment>(
    `UPDATE enrollments
        SET training_course_id = $2,
            sede = COALESCE($3, sede),
            notes = COALESCE($4, notes),
            status = 'inscripto',
            updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, trainingCourseId, sede, notes],
  );
  return res.rows[0] ?? null;
}

/** Totales para los KPIs de la bandeja (scopeados por sucursal; sin paginar). */
export async function enrollmentStats(
  sucursal?: string | null,
): Promise<{ total: number; preinscriptos: number; pendiente_pago: number; completos: number }> {
  const values: unknown[] = [];
  let where = '';
  if (sucursal !== undefined && sucursal !== null) {
    values.push(sucursal);
    where = 'WHERE sede = $1';
  }
  const res = await query<{ total: number; preinscriptos: number; pendiente_pago: number; completos: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'preinscripto')::int AS preinscriptos,
            COUNT(*) FILTER (WHERE payment_status = 'aprobado' AND NOT pago_completo)::int AS pendiente_pago,
            COUNT(*) FILTER (WHERE pago_completo)::int AS completos
       FROM enrollments ${where}`,
    values,
  );
  return res.rows[0];
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

export async function getEnrollmentByPaymentId(paymentId: string): Promise<Enrollment | null> {
  const res = await query<Enrollment>('SELECT * FROM enrollments WHERE payment_id = $1', [paymentId]);
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
