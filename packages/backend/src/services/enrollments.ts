import { query } from '../db/index.js';

export type EnrollmentStatus =
  | 'nuevo' | 'contactado' | 'inscripto' | 'pagado' | 'completado' | 'cancelado';

export interface Enrollment {
  id: string;
  contact_id: string;
  course: string | null;
  sede: string | null;
  status: EnrollmentStatus;
  form_token: string;
  notes: string | null;
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
