import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, requireAdmin, requireInstructorOrAdmin } from '../middleware/auth.js';
import {
  EXAM_CATEGORIES, getCourse, isSucursalActiva,
} from '../agent/catalog.js';
import { listInstructores } from '../services/auth.js';
import {
  listTrainingCourses, getTrainingCourse, getTrainingCourseView, createTrainingCourse,
  updateTrainingCourse, trainingInSucursal, listStudents, getStudent, studentSucursal, addStudent,
  findStudentByCodigo, removeStudent, darDeBaja, reactivarStudent, setStudentTeoria, setPractica,
  cerrarAlumno, listClasses, createClass, deleteClass, classCourseId, getAttendance, setAttendance,
  attendanceSummary,
} from '../services/training.js';
import {
  listBanks, getBank, upsertBank, listQuestions, addQuestion, addQuestionsBulk,
  deleteQuestion, habilitarExamen, getSession, listSessionsByStudent,
  pendingSessionForStudent, iniciarSesion, entregarExamen, validarExamen,
  listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate,
  type PresentedQuestion,
} from '../services/exams.js';
import {
  emitirCertificado, getByStudent, verificar, verifyUrl, anular, renderPdf,
  type CertificateData,
} from '../services/certificates.js';

/**
 * Rutas de la FASE 2 (capacitación, evaluación y certificación).
 *
 * Se monta bajo /api. Rutas de gestión: requireAuth (+ scoping por sucursal como
 * en la Fase 1). Rutas /public/*: sin auth, para el kiosco del examen (tablet) y
 * la verificación pública del certificado (QR).
 */

function scopeOf(req: Request): string | undefined {
  if (req.admin!.role === 'admin') return undefined;
  return req.admin!.sucursal || ' sin-sucursal';
}

export function makeFase2Router(): Router {
  const router = Router();

  // ---- Metadatos para armar los selects del panel ----
  router.get('/exam-categories', requireAuth, (_req, res) => {
    res.json(EXAM_CATEGORIES);
  });

  // Instructores disponibles para asignar a un curso (rol instructor o admin).
  router.get('/instructores', requireAuth, requireInstructorOrAdmin, async (_req, res) => {
    res.json(await listInstructores());
  });

  // ============ CATEGORÍAS DE PREGUNTAS / BANCOS (instructor o admin) ============
  router.get('/exam-banks', requireAuth, async (_req, res) => {
    res.json(await listBanks());
  });

  router.post('/exam-banks', requireAuth, requireInstructorOrAdmin, async (req, res) => {
    const { categoria, nombre, descripcion, preguntasPorExamen, notaMinima, tiempoLimiteMin, intentosMax } =
      req.body as Record<string, unknown>;
    if (typeof categoria !== 'string' || !categoria.trim() || typeof nombre !== 'string' || !nombre.trim()) {
      res.status(400).json({ error: 'Categoría y nombre son requeridos' });
      return;
    }
    const bank = await upsertBank({
      categoria: categoria.trim(),
      nombre: nombre.trim(),
      descripcion: typeof descripcion === 'string' ? descripcion : null,
      preguntas_por_examen: toInt(preguntasPorExamen),
      nota_minima: toInt(notaMinima),
      tiempo_limite_min: toInt(tiempoLimiteMin),
      intentos_max: toInt(intentosMax),
    });
    res.status(201).json(bank);
  });

  router.get('/exam-banks/:id/questions', requireAuth, requireInstructorOrAdmin, async (req, res) => {
    const bank = await getBank(req.params.id);
    if (!bank) {
      res.status(404).json({ error: 'Banco no encontrado' });
      return;
    }
    res.json(await listQuestions(req.params.id));
  });

  router.post('/exam-banks/:id/questions', requireAuth, requireInstructorOrAdmin, async (req, res) => {
    const bank = await getBank(req.params.id);
    if (!bank) {
      res.status(404).json({ error: 'Banco no encontrado' });
      return;
    }
    const { enunciado, opciones, correcta, orden } = req.body as {
      enunciado?: string; opciones?: unknown; correcta?: unknown; orden?: unknown;
    };
    if (!enunciado?.trim() || !Array.isArray(opciones) || opciones.length < 2) {
      res.status(400).json({ error: 'Enunciado y al menos 2 opciones son requeridos' });
      return;
    }
    const ops = opciones.map((o) => String(o));
    const idx = toInt(correcta) ?? -1;
    if (idx < 0 || idx >= ops.length) {
      res.status(400).json({ error: 'La opción correcta está fuera de rango' });
      return;
    }
    res.status(201).json(await addQuestion({
      bankId: req.params.id, enunciado: enunciado.trim(), opciones: ops, correcta: idx, orden: toInt(orden),
    }));
  });

  // Importación masiva de preguntas (Excel/CSV parseado en el panel). Recibe un
  // array ya validado y lo inserta en una transacción.
  router.post('/exam-banks/:id/questions/bulk', requireAuth, requireInstructorOrAdmin, async (req, res) => {
    const bank = await getBank(req.params.id);
    if (!bank) {
      res.status(404).json({ error: 'Banco no encontrado' });
      return;
    }
    const { preguntas } = req.body as { preguntas?: unknown };
    if (!Array.isArray(preguntas) || preguntas.length === 0) {
      res.status(400).json({ error: 'No hay preguntas para importar' });
      return;
    }
    const limpias: { enunciado: string; opciones: string[]; correcta: number }[] = [];
    for (let i = 0; i < preguntas.length; i++) {
      const p = preguntas[i] as { enunciado?: unknown; opciones?: unknown; correcta?: unknown };
      const enunciado = typeof p.enunciado === 'string' ? p.enunciado.trim() : '';
      const opciones = Array.isArray(p.opciones) ? p.opciones.map((o) => String(o).trim()).filter(Boolean) : [];
      const correcta = toInt(p.correcta) ?? -1;
      if (!enunciado || opciones.length < 2) {
        res.status(400).json({ error: `Fila ${i + 1}: enunciado y al menos 2 opciones son requeridos` });
        return;
      }
      if (correcta < 0 || correcta >= opciones.length) {
        res.status(400).json({ error: `Fila ${i + 1}: la opción correcta está fuera de rango` });
        return;
      }
      limpias.push({ enunciado, opciones, correcta });
    }
    const n = await addQuestionsBulk(req.params.id, limpias);
    res.status(201).json({ importadas: n });
  });

  router.delete('/exam-questions/:id', requireAuth, requireInstructorOrAdmin, async (req, res) => {
    const ok = await deleteQuestion(req.params.id);
    res.json({ ok });
  });

  // ============ PLANTILLAS DE EXAMEN (instructor o admin) ============
  // Un preset con nombre que toma preguntas de UNA categoría y fija los
  // parámetros del examen (cantidad, nota mínima, tiempo, intentos).
  router.get('/exam-templates', requireAuth, async (_req, res) => {
    res.json(await listTemplates());
  });

  router.post('/exam-templates', requireAuth, requireInstructorOrAdmin, async (req, res) => {
    const { nombre, bankId, preguntasPorExamen, notaMinima, tiempoLimiteMin, intentosMax } =
      req.body as Record<string, unknown>;
    if (typeof nombre !== 'string' || !nombre.trim()) {
      res.status(400).json({ error: 'El nombre de la plantilla es requerido' });
      return;
    }
    if (typeof bankId !== 'string' || !bankId || !(await getBank(bankId))) {
      res.status(400).json({ error: 'Elegí una categoría de preguntas válida' });
      return;
    }
    const tpl = await createTemplate({
      nombre: nombre.trim(),
      bankId,
      preguntasPorExamen: toInt(preguntasPorExamen),
      notaMinima: toInt(notaMinima),
      tiempoLimiteMin: toInt(tiempoLimiteMin),
      intentosMax: toInt(intentosMax),
      createdBy: req.admin!.email,
    });
    res.status(201).json(tpl);
  });

  router.patch('/exam-templates/:id', requireAuth, requireInstructorOrAdmin, async (req, res) => {
    const tpl = await getTemplate(req.params.id);
    if (!tpl) {
      res.status(404).json({ error: 'Plantilla no encontrada' });
      return;
    }
    const b = req.body as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    if (typeof b.nombre === 'string' && b.nombre.trim()) fields.nombre = b.nombre.trim();
    if (typeof b.bankId === 'string' && b.bankId) {
      if (!(await getBank(b.bankId))) {
        res.status(400).json({ error: 'Categoría inválida' });
        return;
      }
      fields.bank_id = b.bankId;
    }
    const pe = toInt(b.preguntasPorExamen); if (pe !== undefined) fields.preguntas_por_examen = pe;
    const nm = toInt(b.notaMinima); if (nm !== undefined) fields.nota_minima = nm;
    const tl = toInt(b.tiempoLimiteMin); if (tl !== undefined) fields.tiempo_limite_min = tl;
    const im = toInt(b.intentosMax); if (im !== undefined) fields.intentos_max = im;
    if (typeof b.activo === 'boolean') fields.activo = b.activo;
    res.json(await updateTemplate(req.params.id, fields));
  });

  router.delete('/exam-templates/:id', requireAuth, requireInstructorOrAdmin, async (req, res) => {
    res.json({ ok: await deleteTemplate(req.params.id) });
  });

  // =========================== CURSOS ===========================
  router.get('/training-courses', requireAuth, async (req, res) => {
    res.json(await listTrainingCourses(scopeOf(req)));
  });

  router.post('/training-courses', requireAuth, async (req, res) => {
    const { nombre, courseId, bankId, templateId, sede, instructorId, cupoMaximo, fechaInicio, fechaFin, notas } =
      req.body as Record<string, unknown>;
    if (typeof nombre !== 'string' || !nombre.trim()) {
      res.status(400).json({ error: 'El nombre del curso es requerido' });
      return;
    }
    // El operador solo abre cursos de su sucursal; el admin elige la sede.
    const scope = scopeOf(req);
    const sedeFinal = scope ?? (typeof sede === 'string' ? sede.trim() : undefined) ?? undefined;
    if (sedeFinal && !isSucursalActiva(sedeFinal)) {
      res.status(400).json({ error: 'La sucursal no está operativa' });
      return;
    }
    if (typeof courseId === 'string' && courseId && !getCourse(courseId)) {
      res.status(400).json({ error: 'Curso del catálogo inválido' });
      return;
    }
    if (typeof templateId === 'string' && templateId && !(await getTemplate(templateId))) {
      res.status(400).json({ error: 'Plantilla de examen inválida' });
      return;
    }
    const course = await createTrainingCourse({
      nombre: nombre.trim(),
      courseId: typeof courseId === 'string' ? courseId : null,
      bankId: typeof bankId === 'string' && bankId ? bankId : null,
      templateId: typeof templateId === 'string' && templateId ? templateId : null,
      sede: sedeFinal ?? null,
      instructorId: typeof instructorId === 'string' && instructorId ? instructorId : null,
      cupoMaximo: Number.isFinite(Number(cupoMaximo)) && Number(cupoMaximo) > 0 ? Number(cupoMaximo) : null,
      fechaInicio: typeof fechaInicio === 'string' && fechaInicio ? fechaInicio : null,
      fechaFin: typeof fechaFin === 'string' && fechaFin ? fechaFin : null,
      notas: typeof notas === 'string' ? notas : null,
    });
    res.status(201).json(course);
  });

  // Detalle de un curso: datos + alumnos.
  router.get('/training-courses/:id', requireAuth, async (req, res) => {
    const course = await getTrainingCourseView(req.params.id);
    if (!course) {
      res.status(404).json({ error: 'Curso no encontrado' });
      return;
    }
    if (!(await ensureTrainingAccess(req, res, req.params.id))) return;
    const alumnos = await listStudents(req.params.id);
    res.json({ course, alumnos });
  });

  router.patch('/training-courses/:id', requireAuth, async (req, res) => {
    if (!(await ensureTrainingAccess(req, res, req.params.id))) return;
    const body = { ...req.body } as Record<string, unknown>;
    // Reasignar de sucursal es solo del admin.
    if (req.admin!.role !== 'admin') delete body.sede;
    if (typeof body.sede === 'string' && body.sede && !isSucursalActiva(body.sede)) {
      res.status(400).json({ error: 'La sucursal no está operativa' });
      return;
    }
    // Cupo: número positivo o null (sin límite).
    if ('cupo_maximo' in body) {
      const n = Number(body.cupo_maximo);
      body.cupo_maximo = Number.isFinite(n) && n > 0 ? n : null;
    }
    const updated = await updateTrainingCourse(req.params.id, body);
    res.json(updated);
  });

  // ---- Alumnos del curso ----
  router.post('/training-courses/:id/students', requireAuth, async (req, res) => {
    if (!(await ensureTrainingAccess(req, res, req.params.id))) return;
    const { fullName, dni, enrollmentId, contactId } = req.body as {
      fullName?: string; dni?: string; enrollmentId?: string; contactId?: string;
    };
    if (!fullName?.trim() || !dni?.trim()) {
      res.status(400).json({ error: 'Nombre y DNI son requeridos' });
      return;
    }
    const result = await addStudent({
      trainingCourseId: req.params.id, fullName, dni,
      enrollmentId: enrollmentId || null, contactId: contactId || null,
    });
    if ('error' in result) {
      // 409 si es por cupo lleno; 400 para el resto (DNI repetido, etc.).
      res.status(result.error.includes('completo') ? 409 : 400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  // Baja del alumno (abandono / se dio de baja). NO borra: conserva el historial
  // y libera el asiento. Reversible con /reactivar.
  router.post('/students/:id/baja', requireAuth, async (req, res) => {
    if (!(await ensureStudentAccess(req, res, req.params.id))) return;
    const { motivo } = req.body as { motivo?: string };
    const updated = await darDeBaja(req.params.id, motivo);
    if (!updated) {
      res.status(404).json({ error: 'Alumno no encontrado' });
      return;
    }
    res.json(updated);
  });

  // Reactiva a un alumno dado de baja (vuelve a ocupar asiento).
  router.post('/students/:id/reactivar', requireAuth, async (req, res) => {
    if (!(await ensureStudentAccess(req, res, req.params.id))) return;
    const result = await reactivarStudent(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Alumno no encontrado' });
      return;
    }
    if ('error' in result) {
      res.status(409).json(result);
      return;
    }
    res.json(result);
  });

  // Borrado DEFINITIVO (elimina también el historial). Solo admin.
  router.delete('/students/:id', requireAuth, requireAdmin, async (req, res) => {
    if (!(await ensureStudentAccess(req, res, req.params.id))) return;
    res.json({ ok: await removeStudent(req.params.id) });
  });

  // Historial de intentos de examen del alumno.
  router.get('/students/:id/sessions', requireAuth, async (req, res) => {
    if (!(await ensureStudentAccess(req, res, req.params.id))) return;
    res.json(await listSessionsByStudent(req.params.id));
  });

  // ---- Examen teórico: el instructor lo habilita ----
  router.post('/students/:id/exam/enable', requireAuth, async (req, res) => {
    if (!(await ensureStudentAccess(req, res, req.params.id))) return;
    const student = await getStudent(req.params.id);
    if (!student) {
      res.status(404).json({ error: 'Alumno no encontrado' });
      return;
    }
    const course = await getTrainingCourse(student.training_course_id);
    if (!course) {
      res.status(404).json({ error: 'Curso no encontrado' });
      return;
    }
    // Preferimos la plantilla del curso (categoría + parámetros); si no hay,
    // caemos a la categoría directa (bank_id) por compatibilidad.
    const tpl = course.template_id ? await getTemplate(course.template_id) : null;
    const opts = tpl
      ? { bankId: tpl.bank_id, preguntasPorExamen: tpl.preguntas_por_examen, notaMinima: tpl.nota_minima }
      : course.bank_id
        ? { bankId: course.bank_id }
        : null;
    if (!opts) {
      res.status(400).json({ error: 'El curso no tiene plantilla ni categoría de examen asignada' });
      return;
    }
    const result = await habilitarExamen(req.params.id, opts, req.admin!.email);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  // El instructor valida el examen entregado y actualiza el estado del alumno.
  router.post('/exam-sessions/:id/validate', requireAuth, async (req, res) => {
    const session = await getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Sesión no encontrada' });
      return;
    }
    if (!(await ensureStudentAccess(req, res, session.course_student_id))) return;
    if (session.estado !== 'entregado') {
      res.status(400).json({ error: 'El examen todavía no fue entregado' });
      return;
    }
    const validated = await validarExamen(req.params.id, req.admin!.email);
    if (!validated) {
      res.status(409).json({ error: 'No se pudo validar el examen' });
      return;
    }
    await setStudentTeoria(session.course_student_id, validated.aprobado === true);
    res.json(validated);
  });

  // ---- Evaluación práctica (rúbrica del instructor) ----
  router.post('/students/:id/practica', requireAuth, async (req, res) => {
    if (!(await ensureStudentAccess(req, res, req.params.id))) return;
    const { rubrica, aprobada } = req.body as {
      rubrica?: { item?: unknown; ok?: unknown }[]; aprobada?: unknown;
    };
    if (!Array.isArray(rubrica)) {
      res.status(400).json({ error: 'Falta la rúbrica de evaluación' });
      return;
    }
    const clean = rubrica.map((r) => ({ item: String(r.item ?? ''), ok: r.ok === true }));
    const updated = await setPractica(req.params.id, clean, aprobada === true, req.admin!.email);
    res.json(updated);
  });

  // ---- Cierre del alumno + emisión del certificado ----
  router.post('/students/:id/certificate', requireAuth, async (req, res) => {
    if (!(await ensureStudentAccess(req, res, req.params.id))) return;
    const closed = await cerrarAlumno(req.params.id);
    if (!closed) {
      res.status(404).json({ error: 'Alumno no encontrado' });
      return;
    }
    if (closed.estado !== 'aprobado') {
      res.status(400).json({
        error: 'El alumno no está en condiciones: requiere teoría y práctica aprobadas',
      });
      return;
    }
    const course = await getTrainingCourse(closed.training_course_id);
    const bank = course?.bank_id ? await getBank(course.bank_id) : null;
    const sessions = await listSessionsByStudent(req.params.id);
    const nota = sessions.find((s) => s.estado === 'validado' && s.aprobado)?.puntaje ?? null;

    const datos: CertificateData = {
      alumno: closed.full_name,
      dni: closed.dni,
      curso: course?.nombre ?? 'Curso',
      categoria: bank?.categoria ?? null,
      sede: course?.sede ?? null,
      nota,
      instructor: req.admin!.email,
      fecha_curso: course?.fecha_fin ?? course?.fecha_inicio ?? null,
      fecha_emision: new Date().toISOString(),
    };
    const cert = await emitirCertificado(req.params.id, datos, req.admin!.email);
    res.status(201).json({ ...cert, verifyUrl: verifyUrl(cert.codigo_verif) });
  });

  router.get('/students/:id/certificate', requireAuth, async (req, res) => {
    if (!(await ensureStudentAccess(req, res, req.params.id))) return;
    const cert = await getByStudent(req.params.id);
    if (!cert) {
      res.status(404).json({ error: 'Sin certificado' });
      return;
    }
    res.json({ ...cert, verifyUrl: verifyUrl(cert.codigo_verif) });
  });

  // PDF del certificado (con QR embebido). El token va en la query porque una
  // descarga por <a> no puede mandar el header Authorization.
  router.get('/students/:id/certificate/pdf', requireAuth, async (req, res) => {
    if (!(await ensureStudentAccess(req, res, req.params.id))) return;
    const cert = await getByStudent(req.params.id);
    if (!cert) {
      res.status(404).json({ error: 'Sin certificado' });
      return;
    }
    const pdf = await renderPdf(cert);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="certificado-${cert.serial}.pdf"`);
    res.send(pdf);
  });

  router.post('/certificates/:id/anular', requireAuth, requireAdmin, async (req, res) => {
    res.json({ ok: await anular(req.params.id) });
  });

  // ============================ ASISTENCIA ============================
  // Clases del curso y el registro de presentes/ausentes por alumno.
  router.get('/training-courses/:id/classes', requireAuth, async (req, res) => {
    if (!(await ensureTrainingAccess(req, res, req.params.id))) return;
    res.json(await listClasses(req.params.id));
  });

  router.post('/training-courses/:id/classes', requireAuth, async (req, res) => {
    if (!(await ensureTrainingAccess(req, res, req.params.id))) return;
    const { fecha, tema } = req.body as { fecha?: string; tema?: string };
    if (!fecha?.trim()) {
      res.status(400).json({ error: 'La fecha de la clase es requerida' });
      return;
    }
    res.status(201).json(await createClass(req.params.id, fecha.trim(), tema));
  });

  // Resumen de asistencia por alumno en todo el curso.
  router.get('/training-courses/:id/attendance-summary', requireAuth, async (req, res) => {
    if (!(await ensureTrainingAccess(req, res, req.params.id))) return;
    res.json(await attendanceSummary(req.params.id));
  });

  router.delete('/classes/:id', requireAuth, async (req, res) => {
    if (!(await ensureClassAccess(req, res, req.params.id))) return;
    res.json({ ok: await deleteClass(req.params.id) });
  });

  // Asistencia registrada de una clase.
  router.get('/classes/:id/attendance', requireAuth, async (req, res) => {
    if (!(await ensureClassAccess(req, res, req.params.id))) return;
    res.json(await getAttendance(req.params.id));
  });

  // Guarda la asistencia de una clase (presentes/ausentes de varios alumnos).
  router.put('/classes/:id/attendance', requireAuth, async (req, res) => {
    if (!(await ensureClassAccess(req, res, req.params.id))) return;
    const { records } = req.body as { records?: { studentId?: unknown; presente?: unknown }[] };
    if (!Array.isArray(records)) {
      res.status(400).json({ error: 'Falta el listado de asistencia' });
      return;
    }
    const clean = records
      .filter((r) => typeof r.studentId === 'string')
      .map((r) => ({ studentId: r.studentId as string, presente: r.presente === true }));
    await setAttendance(req.params.id, clean);
    res.json({ ok: true });
  });

  // ============ KIOSCO DEL EXAMEN (público, tablet del alumno) ============
  // El alumno inicia con su DNI + el código único. Debe existir una sesión que el
  // instructor haya habilitado. Nunca se devuelven las respuestas correctas.
  router.post('/public/exam/start', async (req, res) => {
    const { dni, codigo } = req.body as { dni?: string; codigo?: string };
    if (!dni?.trim() || !codigo?.trim()) {
      res.status(400).json({ error: 'Ingresá tu DNI y el código del curso' });
      return;
    }
    const student = await findStudentByCodigo(dni, codigo);
    if (!student) {
      res.status(404).json({ error: 'No encontramos tus datos. Revisá el DNI y el código.' });
      return;
    }
    const session = await pendingSessionForStudent(student.id);
    if (!session) {
      res.status(409).json({ error: 'El instructor todavía no habilitó tu examen.' });
      return;
    }
    const bank = await getBank(session.bank_id);
    await iniciarSesion(session.id);
    const preguntas: PresentedQuestion[] = (session.preguntas ?? []).map((q) => ({
      id: q.id, enunciado: q.enunciado, opciones: q.opciones,
    }));
    res.json({
      sessionId: session.id,
      alumno: student.full_name,
      curso: bank?.nombre ?? null,
      tiempoLimiteMin: bank?.tiempo_limite_min ?? null,
      preguntas,
    });
  });

  // Entrega del examen: la plataforma corrige sola y devuelve el resultado.
  router.post('/public/exam/:sessionId/submit', async (req, res) => {
    const { dni, codigo, respuestas } = req.body as {
      dni?: string; codigo?: string; respuestas?: unknown;
    };
    if (!dni?.trim() || !codigo?.trim() || !Array.isArray(respuestas)) {
      res.status(400).json({ error: 'Datos incompletos' });
      return;
    }
    // Re-autenticación por DNI + código (no hay sesión con token en la tablet).
    const student = await findStudentByCodigo(dni, codigo);
    const session = await getSession(req.params.sessionId);
    if (!student || !session || session.course_student_id !== student.id) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }
    const answers = respuestas.map((r) => (typeof r === 'number' ? r : -1));
    const result = await entregarExamen(req.params.sessionId, answers);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    // Al alumno solo le confirmamos que entregó; la nota la valida el instructor.
    res.json({ entregado: true, puntaje: result.puntaje, aprobado: result.aprobado });
  });

  // ============ VERIFICACIÓN PÚBLICA DEL CERTIFICADO (QR) ============
  router.get('/public/verificar/:codigo', async (req, res) => {
    res.json(await verificar(req.params.codigo));
  });

  return router;
}

// --------------------------- helpers de acceso -----------------------------

/** Convierte a entero o devuelve undefined (para campos opcionales del body). */
function toInt(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/** Autoriza a un operador a acceder a un curso (el admin siempre pasa). */
async function ensureTrainingAccess(req: Request, res: Response, id: string): Promise<boolean> {
  const scope = scopeOf(req);
  if (scope === undefined) return true;
  if (await trainingInSucursal(id, scope)) return true;
  res.status(403).json({ error: 'Sin acceso a este curso' });
  return false;
}

/** Autoriza a un operador a acceder a un alumno según la sede de su curso. */
async function ensureStudentAccess(req: Request, res: Response, studentId: string): Promise<boolean> {
  const scope = scopeOf(req);
  if (scope === undefined) return true;
  const sede = await studentSucursal(studentId);
  if (sede === undefined) {
    res.status(404).json({ error: 'Alumno no encontrado' });
    return false;
  }
  if (sede === scope) return true;
  res.status(403).json({ error: 'Sin acceso a este alumno' });
  return false;
}

/** Autoriza el acceso a una clase según la sede del curso al que pertenece. */
async function ensureClassAccess(req: Request, res: Response, classId: string): Promise<boolean> {
  const courseId = await classCourseId(classId);
  if (!courseId) {
    res.status(404).json({ error: 'Clase no encontrada' });
    return false;
  }
  return ensureTrainingAccess(req, res, courseId);
}
