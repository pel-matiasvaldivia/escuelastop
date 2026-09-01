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
  cupo_maximo: number | null;
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
  alumnos: number;   // matriculados totales (incluye bajas)
  activos: number;   // matriculados que NO están dados de baja (ocupan asiento)
}

export type StudentEstado =
  | 'cursando' | 'teoria_aprobada' | 'teoria_desaprobada' | 'aprobado' | 'desaprobado' | 'baja';

export interface CourseStudent {
  id: string;
  training_course_id: string;
  enrollment_id: string | null;
  contact_id: string | null;
  full_name: string;
  dni: string;
  codigo: string;
  estado: StudentEstado;
  baja_motivo: string | null;
  baja_at: string | null;
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
  const res = await query<TrainingCourseView & { alumnos: string; activos: string }>(
    `SELECT tc.*,
            u.email      AS instructor_email,
            COALESCE(b.categoria, tb.categoria) AS banco_categoria,
            t.nombre     AS plantilla_nombre,
            COUNT(cs.id) AS alumnos,
            COUNT(cs.id) FILTER (WHERE cs.estado <> 'baja') AS activos
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
  return res.rows.map((r) => ({ ...r, alumnos: Number(r.alumnos), activos: Number(r.activos) }));
}

/** Opción de curso ABIERTO para que el alumno la elija en el formulario. */
export interface OpenCourseOption {
  id: string;
  nombre: string;
  sede: string | null;
  fecha_inicio: string | null;
  cupo_maximo: number | null;
  activos: number;
  /** Asientos libres; null = sin límite de cupo. */
  asientos_libres: number | null;
  /** true = ya no hay asientos (no se puede elegir). */
  completo: boolean;
}

/**
 * Cursos ABIERTOS de un tipo de catálogo (course_id) en una sucursal, con el
 * estado del cupo. Es lo que ve el alumno en el formulario para elegir cohorte
 * y quedar matriculado automáticamente. Los cursos completos se listan igual
 * (marcados) para que sepa que existe pero está lleno.
 */
export async function listOpenCoursesForCatalog(
  courseId: string, sede: string,
): Promise<OpenCourseOption[]> {
  const res = await query<{
    id: string; nombre: string; sede: string | null; fecha_inicio: string | null;
    cupo_maximo: number | null; activos: string;
  }>(
    `SELECT tc.id, tc.nombre, tc.sede, tc.fecha_inicio, tc.cupo_maximo,
            COUNT(cs.id) FILTER (WHERE cs.estado <> 'baja') AS activos
       FROM training_courses tc
       LEFT JOIN course_students cs ON cs.training_course_id = tc.id
      WHERE tc.course_id = $1 AND tc.sede = $2 AND tc.estado = 'abierto'
      GROUP BY tc.id
      ORDER BY tc.fecha_inicio NULLS LAST, tc.created_at`,
    [courseId, sede],
  );
  return res.rows.map((r) => {
    const activos = Number(r.activos);
    const libres = r.cupo_maximo == null ? null : Math.max(0, r.cupo_maximo - activos);
    return {
      id: r.id,
      nombre: r.nombre,
      sede: r.sede,
      fecha_inicio: r.fecha_inicio,
      cupo_maximo: r.cupo_maximo,
      activos,
      asientos_libres: libres,
      completo: libres !== null && libres <= 0,
    };
  });
}

export async function getTrainingCourse(id: string): Promise<TrainingCourse | null> {
  const res = await query<TrainingCourse>('SELECT * FROM training_courses WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

/** Curso con datos derivados (instructor, categoría, plantilla) para el detalle. */
export async function getTrainingCourseView(id: string): Promise<TrainingCourseView | null> {
  const res = await query<TrainingCourseView & { alumnos: string; activos: string }>(
    `SELECT tc.*,
            u.email      AS instructor_email,
            COALESCE(b.categoria, tb.categoria) AS banco_categoria,
            t.nombre     AS plantilla_nombre,
            COUNT(cs.id) AS alumnos,
            COUNT(cs.id) FILTER (WHERE cs.estado <> 'baja') AS activos
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
  return row ? { ...row, alumnos: Number(row.alumnos), activos: Number(row.activos) } : null;
}

export async function createTrainingCourse(input: {
  nombre: string;
  courseId?: string | null;
  bankId?: string | null;
  templateId?: string | null;
  sede?: string | null;
  instructorId?: string | null;
  cupoMaximo?: number | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  notas?: string | null;
}): Promise<TrainingCourse> {
  const res = await query<TrainingCourse>(
    `INSERT INTO training_courses
       (nombre, course_id, bank_id, template_id, sede, instructor_id, cupo_maximo, fecha_inicio, fecha_fin, notas)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      input.nombre, input.courseId ?? null, input.bankId ?? null, input.templateId ?? null,
      input.sede ?? null, input.instructorId ?? null, input.cupoMaximo ?? null,
      input.fechaInicio ?? null, input.fechaFin ?? null, input.notas ?? null,
    ],
  );
  return res.rows[0];
}

export async function updateTrainingCourse(
  id: string,
  fields: Partial<{
    nombre: string; bank_id: string | null; template_id: string | null; sede: string | null;
    instructor_id: string | null; cupo_maximo: number | null;
    fecha_inicio: string | null; fecha_fin: string | null;
    estado: TrainingEstado; notas: string | null;
  }>,
): Promise<TrainingCourse | null> {
  const allowed: (keyof typeof fields)[] = [
    'nombre', 'bank_id', 'template_id', 'sede', 'instructor_id', 'cupo_maximo',
    'fecha_inicio', 'fecha_fin', 'estado', 'notas',
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

/** Cantidad de alumnos que ocupan asiento (matriculados que no están de baja). */
export async function countActiveStudents(trainingCourseId: string): Promise<number> {
  const res = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM course_students
      WHERE training_course_id = $1 AND estado <> 'baja'`,
    [trainingCourseId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

/** ¿Hay asiento libre? Devuelve true si no hay cupo definido o todavía entra. */
async function hayCupo(trainingCourseId: string): Promise<boolean> {
  const course = await getTrainingCourse(trainingCourseId);
  if (!course || course.cupo_maximo == null) return true;
  return (await countActiveStudents(trainingCourseId)) < course.cupo_maximo;
}

/**
 * Matricula un alumno en un curso. Respeta el cupo de asientos. Si ya existía un
 * alumno con ese DNI que estaba dado de baja, lo reactiva (conserva su historial)
 * en vez de duplicarlo. Genera un código único (reintenta ante colisión).
 */
export async function addStudent(input: {
  trainingCourseId: string;
  fullName: string;
  dni: string;
  enrollmentId?: string | null;
  contactId?: string | null;
}): Promise<CourseStudent | { error: string }> {
  const dni = input.dni.trim();
  const fullName = input.fullName.trim();

  // ¿Ya existe (activo o de baja) con ese DNI en el curso?
  const existing = await query<CourseStudent>(
    'SELECT * FROM course_students WHERE training_course_id = $1 AND dni = $2',
    [input.trainingCourseId, dni],
  );
  const prev = existing.rows[0];
  if (prev) {
    if (prev.estado !== 'baja') {
      return { error: 'Ese DNI ya está matriculado en el curso' };
    }
    // Reactivar una baja ocupa un asiento: verificamos el cupo.
    if (!(await hayCupo(input.trainingCourseId))) {
      return { error: 'El curso está completo: no hay asientos disponibles' };
    }
    const re = await query<CourseStudent>(
      `UPDATE course_students
          SET estado = 'cursando', baja_motivo = NULL, baja_at = NULL,
              full_name = $2, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [prev.id, fullName],
    );
    return re.rows[0];
  }

  if (!(await hayCupo(input.trainingCourseId))) {
    return { error: 'El curso está completo: no hay asientos disponibles' };
  }

  for (let intento = 0; intento < 5; intento++) {
    try {
      const res = await query<CourseStudent>(
        `INSERT INTO course_students
           (training_course_id, full_name, dni, codigo, enrollment_id, contact_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          input.trainingCourseId, fullName, dni,
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

/** Alumno activo matriculado a partir de una inscripción (para notificar/gate). */
export async function getStudentByEnrollment(enrollmentId: string): Promise<CourseStudent | null> {
  const res = await query<CourseStudent>(
    `SELECT * FROM course_students
      WHERE enrollment_id = $1 AND estado <> 'baja'
      ORDER BY created_at DESC LIMIT 1`,
    [enrollmentId],
  );
  return res.rows[0] ?? null;
}

/**
 * ¿El código del alumno está habilitado para rendir? Si la matrícula viene de
 * una inscripción online, se exige que el pago total esté completo (la seña es
 * solo un anticipo). Los alumnos cargados a mano (sin inscripción) no tienen
 * este gate.
 */
export async function isCodigoHabilitado(courseStudentId: string): Promise<boolean> {
  const res = await query<{ habilitado: boolean }>(
    `SELECT NOT EXISTS (
       SELECT 1 FROM course_students cs
       JOIN enrollments e ON e.id = cs.enrollment_id
       WHERE cs.id = $1 AND e.pago_completo = FALSE
     ) AS habilitado`,
    [courseStudentId],
  );
  return res.rows[0]?.habilitado ?? true;
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

/**
 * Da de baja a un alumno (abandono / se dio de baja). NO lo borra: conserva su
 * historial (exámenes, asistencia) y libera el asiento. Reversible con reactivar.
 */
export async function darDeBaja(id: string, motivo?: string | null): Promise<CourseStudent | null> {
  const res = await query<CourseStudent>(
    `UPDATE course_students
        SET estado = 'baja', baja_motivo = $2, baja_at = now(), updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id, motivo?.trim() || null],
  );
  return res.rows[0] ?? null;
}

/** Reactiva a un alumno dado de baja (vuelve a 'cursando'). Verifica el cupo. */
export async function reactivarStudent(id: string): Promise<CourseStudent | { error: string } | null> {
  const student = await getStudent(id);
  if (!student) return null;
  if (student.estado !== 'baja') return student; // ya activo, nada que hacer
  if (!(await hayCupo(student.training_course_id))) {
    return { error: 'El curso está completo: no hay asientos disponibles' };
  }
  const res = await query<CourseStudent>(
    `UPDATE course_students
        SET estado = 'cursando', baja_motivo = NULL, baja_at = NULL, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [id],
  );
  return res.rows[0] ?? null;
}

/** Borrado DEFINITIVO del alumno (elimina también su historial). Solo admin. */
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

// ------------------------------ Asistencia ---------------------------------

export interface CourseClass {
  id: string;
  training_course_id: string;
  fecha: string;
  tema: string | null;
  created_at: string;
}

/** Clase con el conteo de presentes (para el listado). */
export interface CourseClassView extends CourseClass {
  presentes: number;
  ausentes: number;
}

export interface AttendanceRecord {
  course_student_id: string;
  presente: boolean;
}

/** Resumen de asistencia por alumno en un curso. */
export interface AttendanceSummary {
  course_student_id: string;
  presentes: number;
  ausentes: number;
}

/** Lista las clases de un curso, con cuántos presentes/ausentes tuvo cada una. */
export async function listClasses(trainingCourseId: string): Promise<CourseClassView[]> {
  const res = await query<CourseClassView & { presentes: string; ausentes: string }>(
    `SELECT cc.*,
            COUNT(a.id) FILTER (WHERE a.presente)     AS presentes,
            COUNT(a.id) FILTER (WHERE NOT a.presente) AS ausentes
       FROM course_classes cc
       LEFT JOIN class_attendance a ON a.class_id = cc.id
      WHERE cc.training_course_id = $1
      GROUP BY cc.id
      ORDER BY cc.fecha DESC, cc.created_at DESC`,
    [trainingCourseId],
  );
  return res.rows.map((r) => ({ ...r, presentes: Number(r.presentes), ausentes: Number(r.ausentes) }));
}

export async function getClass(id: string): Promise<CourseClass | null> {
  const res = await query<CourseClass>('SELECT * FROM course_classes WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

/** Curso al que pertenece una clase (para el scoping de operadores). */
export async function classCourseId(id: string): Promise<string | null> {
  const res = await query<{ training_course_id: string }>(
    'SELECT training_course_id FROM course_classes WHERE id = $1',
    [id],
  );
  return res.rows[0]?.training_course_id ?? null;
}

export async function createClass(
  trainingCourseId: string, fecha: string, tema?: string | null,
): Promise<CourseClass> {
  const res = await query<CourseClass>(
    `INSERT INTO course_classes (training_course_id, fecha, tema)
     VALUES ($1, $2, $3) RETURNING *`,
    [trainingCourseId, fecha, tema?.trim() || null],
  );
  return res.rows[0];
}

export async function deleteClass(id: string): Promise<boolean> {
  const res = await query('DELETE FROM course_classes WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

/** Registros de asistencia guardados para una clase. */
export async function getAttendance(classId: string): Promise<AttendanceRecord[]> {
  const res = await query<AttendanceRecord>(
    'SELECT course_student_id, presente FROM class_attendance WHERE class_id = $1',
    [classId],
  );
  return res.rows;
}

/** Guarda (upsert) la asistencia de una clase para varios alumnos. */
export async function setAttendance(
  classId: string, records: { studentId: string; presente: boolean }[],
): Promise<boolean> {
  for (const r of records) {
    await query(
      `INSERT INTO class_attendance (class_id, course_student_id, presente)
       VALUES ($1, $2, $3)
       ON CONFLICT (class_id, course_student_id)
       DO UPDATE SET presente = EXCLUDED.presente, updated_at = now()`,
      [classId, r.studentId, r.presente],
    );
  }
  return true;
}

/** Resumen de asistencia por alumno (presentes/ausentes) en todo el curso. */
export async function attendanceSummary(trainingCourseId: string): Promise<AttendanceSummary[]> {
  const res = await query<AttendanceSummary & { presentes: string; ausentes: string }>(
    `SELECT a.course_student_id,
            COUNT(*) FILTER (WHERE a.presente)     AS presentes,
            COUNT(*) FILTER (WHERE NOT a.presente) AS ausentes
       FROM class_attendance a
       JOIN course_classes cc ON cc.id = a.class_id
      WHERE cc.training_course_id = $1
      GROUP BY a.course_student_id`,
    [trainingCourseId],
  );
  return res.rows.map((r) => ({
    course_student_id: r.course_student_id,
    presentes: Number(r.presentes),
    ausentes: Number(r.ausentes),
  }));
}
