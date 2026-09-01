import { getEnrollmentByToken, setEnrollmentTrainingCourse, type Enrollment } from './enrollments.js';
import { getContactById, updateContact } from './contacts.js';
import { addStudent, getTrainingCourse, type CourseStudent, type TrainingCourse } from './training.js';

/**
 * Matriculación automática tras el pago: con la seña aprobada y el alumno
 * habiendo elegido un CURSO ABIERTO concreto, se lo matricula en ese cohorte
 * (respetando el cupo) y se deja la inscripción vinculada al curso.
 *
 * Devuelve un error legible (con `code` para el status HTTP) en vez de lanzar,
 * para que la ruta pública responda de forma prolija.
 */
export type MatriculationResult =
  | { ok: true; enrollment: Enrollment; course: TrainingCourse; student: CourseStudent }
  | { ok: false; code: number; error: string };

export async function matriculateAfterPayment(input: {
  token: string;
  trainingCourseId: string;
  /** Nombre/DNI que el alumno completa en el formulario (puede faltar en el contacto). */
  fullName?: string;
  dni?: string;
}): Promise<MatriculationResult> {
  const enrollment = await getEnrollmentByToken(input.token);
  if (!enrollment) return { ok: false, code: 404, error: 'Inscripción no encontrada' };

  // GATE: solo se matricula con la seña aprobada.
  if (enrollment.payment_status !== 'aprobado') {
    return { ok: false, code: 402, error: 'Pago no confirmado. Completá la seña para elegir tu curso.' };
  }

  const course = await getTrainingCourse(input.trainingCourseId);
  if (!course) return { ok: false, code: 404, error: 'El curso elegido no existe' };
  if (course.estado !== 'abierto') {
    return { ok: false, code: 409, error: 'El curso elegido ya no está abierto a inscripción' };
  }

  // Datos del alumno: preferimos lo que llega del formulario y completamos el
  // contacto para que el DNI/nombre queden guardados.
  const contact = await getContactById(enrollment.contact_id);
  const fullName = (input.fullName ?? contact?.full_name ?? '').trim();
  const dni = (input.dni ?? contact?.dni ?? '').trim();
  if (!fullName || !dni) {
    return { ok: false, code: 400, error: 'Necesitamos tu nombre y DNI para matricularte' };
  }
  if (contact && (input.fullName || input.dni)) {
    await updateContact(contact.id, {
      full_name: fullName,
      ...(input.dni ? { dni } : {}),
    });
  }

  // Matriculación en el cohorte (respeta el cupo; reactiva una baja previa).
  const student = await addStudent({
    trainingCourseId: course.id,
    fullName,
    dni,
    enrollmentId: enrollment.id,
    contactId: enrollment.contact_id,
  });
  if ('error' in student) {
    // Cupo lleno u otro conflicto de negocio.
    return { ok: false, code: 409, error: student.error };
  }

  const note = `🎓 Matriculado automáticamente en "${course.nombre}"` +
    `${course.fecha_inicio ? ` (inicio ${new Date(course.fecha_inicio).toLocaleDateString('es-AR')})` : ''}` +
    ` — código ${student.codigo}`;
  const updated = await setEnrollmentTrainingCourse(enrollment.id, course.id, course.sede, note);

  return { ok: true, enrollment: updated ?? enrollment, course, student };
}
