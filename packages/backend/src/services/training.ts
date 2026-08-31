import { randomInt } from 'node:crypto';
import { query } from '../db/index.js';

/**
 * Capacitación de la Fase 2: cursos (cohortes) y sus alumnos.
 *
 * Un CURSO (training_courses) es una instancia concreta de capacitación, en una
 * sucursal, a cargo de un instructor y con el banco de examen que le corresponde.
 * Los ALUMNOS (course_students) se matriculan al curso — desde una
 * inscripción de la Fase 1 o cargados a mano — y cada uno recibe un código único
 * con el que inicia el examen en la tablet.
 */

export type TrainingEstado = 'abierto' | 'en_curso' | 'cerrado' | 'cancelado';

export interface TrainingCourse {
  id: string;
  nombre: string;
  course_id: string | null;
  bank_id: string | null;
  template_id: string | null;
  sede: string | null;
  instructor_id: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: TrainingEstado;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** Curso con datos derivados para el listado del panel. */
export interface TrainingCourseView extends TrainingCourse {
  instructor_email: string | null;
  banco_categoria: string | null;
  plantilla_nombre: string | null;
  alumnos: number;
}

export type StudentEstado =
  | 'cursando' | 'teoria_aprobada' | 'teoria_desaprobada' | 'aprobado' | 'desaprobado';

export interface CourseStudent {
  id: string;
  training_course_id: string;
  enrollment_id: string | null;
  contact_id: string | null;
  full_name: string;
  dni: string;
  codigo: string;
  estado: StudentEstado;
  practica_aprobada: boolean | null;
  practica_rubrica: { item: string; ok: boolean }[] | null;
  practica_por: string | null;
  practica_at: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------ Cursos ---------------------------------

/** Genera un código corto legible para el alumno (evita 0/O y 1/I). */
function generarCodigo(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += abc[randomInt(abc.length)];
  return out;
}

/**
 * Lista cursos para el panel. `sucursal` aplica el scoping de operadores
 * (solo ven las de su sede); el admin no pasa filtro y ve todas.
 */
export async function listTrainingCourses(
  sucursal?: string | null,
): Promise<TrainingCourseView[]> {
  const values: unknown[] = [];
  let where = '';
  if (sucursal !== undefined && sucursal !== null) {
    values.push(sucursal);
    where = `WHERE tc.sede = $1`;
  }
  const res = await query<TrainingCourseView & { alumnos: string }>(
    `SELECT tc.*,
            u.email      AS instructor_email,
            COALESCE(b.categoria, tb.categoria) AS banco_categoria,
            t.nombre     AS plantilla_nombre,
            COUNT(cs.id) AS alumnos
       FROM training_courses tc
       LEFT JOIN admin_users u    ON u.id = tc.instructor_id
       LEFT JOIN exam_banks  b    ON b.id = tc.bank_id
       LEFT JOIN exam_templates t ON t.id = tc.template_id
       LEFT JOIN exam_banks  tb   ON tb.id = t.bank_id
       LEFT JOIN course_students cs ON cs.training_course_id = tc.id
       ${where}
      GROUP BY tc.id, u.email, b.categoria, tb.categoria, t.nombre
      ORDER BY tc.created_at DESC`,
    values,
  );
  return res.rows.map((r) => ({ ...r, alumnos: Number(r.alumnos) }));
}

export async function getTrainingCourse(id: string): Promise<TrainingCourse | null> {
  const res = await query<TrainingCourse>('SELECT * FROM training_courses WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

/** Curso con datos derivados (instructor, categoría, plantilla) para el detalle. */
export async function getTrainingCourseView(id: string): Promise<TrainingCourseView | null> {
  const res = await query<TrainingCourseView & { alumnos: string }>(
    `SELECT tc.*,
            u.email      AS instructor_email,
            COALESCE(b.categoria, tb.categoria) AS banco_categoria,
            t.nombre     AS plantilla_nombre,
            COUNT(cs.id) AS alumnos
       FROM training_courses tc
       LEFT JOIN admin_users u    ON u.id = tc.instructor_id
       LEFT JOIN exam_banks  b    ON b.id = tc.bank_id
       LEFT JOIN exam_templates t ON t.id = tc.template_id
       LEFT JOIN exam_banks  tb   ON tb.id = t.bank_id
       LEFT JOIN course_students cs ON cs.training_course_id = tc.id
      WHERE tc.id = $1
      GROUP BY tc.id, u.email, b.categoria, tb.categoria, t.nombre`,
    [id],
  );
  const row = res.rows[0];
  return row ? { ...row, alumnos: Number(row.alumnos) } : null;
}

export async function createTrainingCourse(input: {
  nombre: string;
  courseId?: string | null;
  bankId?: string | null;
  templateId?: string | null;
  sede?: string | null;
  instructorId?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  notas?: string | null;
}): Promise<TrainingCourse> {
  const res = await query<TrainingCourse>(
    `INSERT INTO training_courses
       (nombre, course_id, bank_id, template_id, sede, instructor_id, fecha_inicio, fecha_fin, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      input.nombre, input.courseId ?? null, input.bankId ?? null, input.templateId ?? null,
      input.sede ?? null, input.instructorId ?? null, input.fechaInicio ?? null,
      input.fechaFin ?? null, input.notas ?? null,
    ],
  );
  return res.rows[0];
}

export async function updateTrainingCourse(
  id: string,
  fields: Partial<{
    nombre: string; bank_id: string | null; template_id: string | null; sede: string | null;
    instructor_id: string | null; fecha_inicio: string | null; fecha_fin: string | null;
    estado: TrainingEstado; notas: string | null;
  }>,
): Promise<TrainingCourse | null> {
  const allowed: (keyof typeof fields)[] = [
    'nombre', 'bank_id', 'template_id', 'sede', 'instructor_id', 'fecha_inicio', 'fecha_fin', 'estado', 'notas',
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (sets.length === 0) return getTrainingCourse(id);
  values.push(id);
  const res = await query<TrainingCourse>(
    `UPDATE training_courses SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${values.length} RETURNING *`,
    values,
  );
  return res.rows[0] ?? null;
}

/** ¿Este curso pertenece a esta sucursal? (autorización de operadores). */
export async function trainingInSucursal(id: string, sucursal: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    'SELECT TRUE AS ok FROM training_courses WHERE id = $1 AND sede = $2',
    [id, sucursal],
  );
  return res.rows.length > 0;
}

// -------------------------------- Alumnos ----------------------------------

export async function listStudents(trainingCourseId: string): Promise<CourseStudent[]> {
  const res = await query<CourseStudent>(
    'SELECT * FROM course_students WHERE training_course_id = $1 ORDER BY full_name',
    [trainingCourseId],
  );
  return res.rows;
}

export async function getStudent(id: string): Promise<CourseStudent | null> {
  const res = await query<CourseStudent>('SELECT * FROM course_students WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

/** Sucursal del curso de un alumno (para el scoping de operadores). */
export async function studentSucursal(id: string): Promise<string | null | undefined> {
  const res = await query<{ sede: string | null }>(
    `SELECT tc.sede FROM course_students cs
       JOIN training_courses tc ON tc.id = cs.training_course_id
      WHERE cs.id = $1`,
    [id],
  );
  return res.rows.length ? res.rows[0].sede : undefined;
}

/** Matricula un alumno en un curso. Genera un código único (reintenta ante colisión). */
export async function addStudent(input: {
  trainingCourseId: string;
  fullName: string;
  dni: string;
  enrollmentId?: string | null;
  contactId?: string | null;
}): Promise<CourseStudent | { error: string }> {
  for (let intento = 0; intento < 5; intento++) {
    try {
      const res = await query<CourseStudent>(
        `INSERT INTO course_students
           (training_course_id, full_name, dni, codigo, enrollment_id, contact_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          input.trainingCourseId, input.fullName.trim(), input.dni.trim(),
          generarCodigo(), input.enrollmentId ?? null, input.contactId ?? null,
        ],
      );
      return res.rows[0];
    } catch (err) {
      const code = (err as { code?: string }).code;
      // 23505 = unique_violation. Puede ser el DNI (alumno repetido) o el código.
      if (code === '23505') {
        const detail = String((err as { detail?: string }).detail ?? '');
        if (detail.includes('dni')) return { error: 'Ese DNI ya está matriculado en el curso' };
        continue; // colisión de código: reintenta
      }
      throw err;
    }
  }
  return { error: 'No se pudo generar un código único, reintentá' };
}

/** Busca un alumno por DNI + código (para el kiosco del examen en la tablet). */
export async function findStudentByCodigo(
  dni: string, codigo: string,
): Promise<CourseStudent | null> {
  const res = await query<CourseStudent>(
    'SELECT * FROM course_students WHERE dni = $1 AND codigo = $2',
    [dni.trim(), codigo.trim().toUpperCase()],
  );
  return res.rows[0] ?? null;
}

export async function removeStudent(id: string): Promise<boolean> {
  const res = await query('DELETE FROM course_students WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

/** Actualiza el estado teórico del alumno tras validar el examen. */
export async function setStudentTeoria(id: string, aprobado: boolean): Promise<CourseStudent | null> {
  const res = await query<CourseStudent>(
    `UPDATE course_students
        SET estado = $2, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, aprobado ? 'teoria_aprobada' : 'teoria_desaprobada'],
  );
  return res.rows[0] ?? null;
}

/** Registra la evaluación práctica (rúbrica de habilidades) del instructor. */
export async function setPractica(
  id: string,
  rubrica: { item: string; ok: boolean }[],
  aprobada: boolean,
  instructor: string,
): Promise<CourseStudent | null> {
  const res = await query<CourseStudent>(
    `UPDATE course_students
        SET practica_rubrica = $2::jsonb, practica_aprobada = $3,
            practica_por = $4, practica_at = now(), updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(rubrica), aprobada, instructor],
  );
  return res.rows[0] ?? null;
}

/**
 * Cierra el curso del alumno: aprobado si teoría + práctica están aprobadas.
 * Devuelve el alumno actualizado y si quedó en condiciones de certificar.
 */
export async function cerrarAlumno(id: string): Promise<CourseStudent | null> {
  const student = await getStudent(id);
  if (!student) return null;
  const aprobado = student.estado === 'teoria_aprobada' && student.practica_aprobada === true;
  const res = await query<CourseStudent>(
    `UPDATE course_students SET estado = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, aprobado ? 'aprobado' : 'desaprobado'],
  );
  return res.rows[0] ?? null;
}
