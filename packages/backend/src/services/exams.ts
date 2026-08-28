import { randomInt } from 'node:crypto';
import { query } from '../db/index.js';

/**
 * Exámenes teóricos de la Fase 2.
 *
 * Cada tipo de licencia tiene su propio BANCO de preguntas (exam_banks). El
 * instructor HABILITA una sesión para un alumno; el alumno la rinde en la tablet
 * con DNI + código; la plataforma sortea las preguntas del banco, corrige sola y
 * el instructor VALIDA el resultado. Las respuestas correctas nunca se envían al
 * frontend del alumno.
 */

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
  created_at: string;
  updated_at: string;
}

export interface ExamQuestion {
  id: string;
  bank_id: string;
  enunciado: string;
  opciones: string[];
  correcta: number;
  activa: boolean;
  orden: number;
  created_at: string;
}

/** Pregunta tal como se le presenta al alumno (sin la respuesta correcta). */
export interface PresentedQuestion {
  id: string;
  enunciado: string;
  opciones: string[];
}

export type ExamSessionEstado =
  | 'habilitado' | 'en_curso' | 'entregado' | 'validado' | 'anulado';

export interface ExamSession {
  id: string;
  course_student_id: string;
  bank_id: string;
  estado: ExamSessionEstado;
  preguntas: { id: string; enunciado: string; opciones: string[]; correcta: number }[] | null;
  respuestas: number[] | null;
  puntaje: number | null;
  aprobado: boolean | null;
  habilitado_por: string | null;
  validado_por: string | null;
  habilitado_at: string;
  iniciado_at: string | null;
  entregado_at: string | null;
  validado_at: string | null;
}

// ------------------------------- Bancos ------------------------------------

export async function listBanks(): Promise<(ExamBank & { preguntas: number })[]> {
  const res = await query<ExamBank & { preguntas: string }>(
    `SELECT b.*, COUNT(q.id) FILTER (WHERE q.activa) AS preguntas
       FROM exam_banks b
       LEFT JOIN exam_questions q ON q.bank_id = b.id
      GROUP BY b.id
      ORDER BY b.categoria`,
  );
  return res.rows.map((r) => ({ ...r, preguntas: Number(r.preguntas) }));
}

export async function getBank(id: string): Promise<ExamBank | null> {
  const res = await query<ExamBank>('SELECT * FROM exam_banks WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

export async function getBankByCategoria(categoria: string): Promise<ExamBank | null> {
  const res = await query<ExamBank>('SELECT * FROM exam_banks WHERE categoria = $1', [categoria]);
  return res.rows[0] ?? null;
}

/** Crea o actualiza un banco (por categoría). Útil para el seed y la carga. */
export async function upsertBank(input: {
  categoria: string;
  nombre: string;
  descripcion?: string | null;
  preguntas_por_examen?: number;
  nota_minima?: number;
  tiempo_limite_min?: number;
  intentos_max?: number;
}): Promise<ExamBank> {
  const res = await query<ExamBank>(
    `INSERT INTO exam_banks
       (categoria, nombre, descripcion, preguntas_por_examen, nota_minima, tiempo_limite_min, intentos_max)
     VALUES ($1, $2, $3, COALESCE($4, 10), COALESCE($5, 70), COALESCE($6, 30), COALESCE($7, 2))
     ON CONFLICT (categoria) DO UPDATE SET
       nombre = EXCLUDED.nombre,
       descripcion = EXCLUDED.descripcion,
       preguntas_por_examen = EXCLUDED.preguntas_por_examen,
       nota_minima = EXCLUDED.nota_minima,
       tiempo_limite_min = EXCLUDED.tiempo_limite_min,
       intentos_max = EXCLUDED.intentos_max,
       updated_at = now()
     RETURNING *`,
    [
      input.categoria, input.nombre, input.descripcion ?? null,
      input.preguntas_por_examen ?? null, input.nota_minima ?? null,
      input.tiempo_limite_min ?? null, input.intentos_max ?? null,
    ],
  );
  return res.rows[0];
}

// ------------------------------ Preguntas ----------------------------------

export async function listQuestions(bankId: string): Promise<ExamQuestion[]> {
  const res = await query<ExamQuestion>(
    'SELECT * FROM exam_questions WHERE bank_id = $1 ORDER BY orden, created_at',
    [bankId],
  );
  return res.rows;
}

export async function addQuestion(input: {
  bankId: string;
  enunciado: string;
  opciones: string[];
  correcta: number;
  orden?: number;
}): Promise<ExamQuestion> {
  const res = await query<ExamQuestion>(
    `INSERT INTO exam_questions (bank_id, enunciado, opciones, correcta, orden)
     VALUES ($1, $2, $3::jsonb, $4, COALESCE($5, 0)) RETURNING *`,
    [input.bankId, input.enunciado, JSON.stringify(input.opciones), input.correcta, input.orden ?? null],
  );
  return res.rows[0];
}

export async function deleteQuestion(id: string): Promise<boolean> {
  const res = await query('DELETE FROM exam_questions WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

// ------------------------------ Sesiones -----------------------------------

/** Baraja una copia del array (Fisher–Yates con RNG criptográfico). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * El instructor habilita el examen de un alumno. Sortea las preguntas del banco
 * de la comisión y deja la sesión lista para que el alumno la inicie en la tablet.
 */
export async function habilitarExamen(
  courseStudentId: string, bankId: string, instructor: string,
): Promise<ExamSession | { error: string }> {
  const bank = await getBank(bankId);
  if (!bank) return { error: 'La comisión no tiene un banco de examen asociado' };

  const all = await listQuestions(bankId);
  const activas = all.filter((q) => q.activa);
  if (activas.length === 0) return { error: 'El banco no tiene preguntas cargadas' };

  const n = Math.min(bank.preguntas_por_examen, activas.length);
  const seleccion = shuffle(activas).slice(0, n).map((q) => ({
    id: q.id, enunciado: q.enunciado, opciones: q.opciones, correcta: q.correcta,
  }));

  const res = await query<ExamSession>(
    `INSERT INTO exam_sessions (course_student_id, bank_id, estado, preguntas, habilitado_por)
     VALUES ($1, $2, 'habilitado', $3::jsonb, $4) RETURNING *`,
    [courseStudentId, bankId, JSON.stringify(seleccion), instructor],
  );
  return res.rows[0];
}

export async function getSession(id: string): Promise<ExamSession | null> {
  const res = await query<ExamSession>('SELECT * FROM exam_sessions WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

/** Sesiones de un alumno (historial de intentos). */
export async function listSessionsByStudent(courseStudentId: string): Promise<ExamSession[]> {
  const res = await query<ExamSession>(
    'SELECT * FROM exam_sessions WHERE course_student_id = $1 ORDER BY habilitado_at DESC',
    [courseStudentId],
  );
  return res.rows;
}

/** Sesión habilitada más reciente de un alumno (la que puede rendir ahora). */
export async function pendingSessionForStudent(courseStudentId: string): Promise<ExamSession | null> {
  const res = await query<ExamSession>(
    `SELECT * FROM exam_sessions
      WHERE course_student_id = $1 AND estado IN ('habilitado','en_curso')
      ORDER BY habilitado_at DESC LIMIT 1`,
    [courseStudentId],
  );
  return res.rows[0] ?? null;
}

/** Marca la sesión como iniciada (el alumno arrancó el examen en la tablet). */
export async function iniciarSesion(id: string): Promise<ExamSession | null> {
  const res = await query<ExamSession>(
    `UPDATE exam_sessions
        SET estado = 'en_curso',
            iniciado_at = COALESCE(iniciado_at, now())
      WHERE id = $1 AND estado IN ('habilitado','en_curso') RETURNING *`,
    [id],
  );
  return res.rows[0] ?? null;
}

/**
 * Corrige y entrega el examen. Compara las respuestas del alumno contra el
 * snapshot de preguntas de la sesión y calcula el % de acierto.
 */
export async function entregarExamen(
  id: string, respuestas: number[],
): Promise<ExamSession | { error: string }> {
  const session = await getSession(id);
  if (!session) return { error: 'Sesión no encontrada' };
  if (session.estado === 'validado') return { error: 'El examen ya fue validado' };
  if (!session.preguntas) return { error: 'La sesión no tiene preguntas' };

  const bank = await getBank(session.bank_id);
  const notaMinima = bank?.nota_minima ?? 70;

  const total = session.preguntas.length;
  let correctas = 0;
  session.preguntas.forEach((q, i) => {
    if (respuestas[i] === q.correcta) correctas++;
  });
  const puntaje = total > 0 ? Math.round((correctas / total) * 100) : 0;
  const aprobado = puntaje >= notaMinima;

  const res = await query<ExamSession>(
    `UPDATE exam_sessions
        SET estado = 'entregado', respuestas = $2::jsonb, puntaje = $3, aprobado = $4,
            entregado_at = now()
      WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(respuestas), puntaje, aprobado],
  );
  return res.rows[0];
}

/** El instructor valida el examen entregado (cierra el resultado teórico). */
export async function validarExamen(
  id: string, instructor: string,
): Promise<ExamSession | null> {
  const res = await query<ExamSession>(
    `UPDATE exam_sessions
        SET estado = 'validado', validado_por = $2, validado_at = now()
      WHERE id = $1 AND estado = 'entregado' RETURNING *`,
    [id, instructor],
  );
  return res.rows[0] ?? null;
}
