import type { MessagingChannel } from '../whatsapp/channel.js';
import { getContactById } from './contacts.js';
import { sendMail } from './mailer.js';
import type { Enrollment } from './enrollments.js';
import type { CourseStudent, TrainingCourse } from './training.js';
import { SUCURSALES } from '../agent/catalog.js';

/**
 * Notificaciones al alumno en cada paso del embudo de inscripción/matriculación.
 *
 * Cada paso avisa por los DOS canales disponibles: WhatsApp (si el canal está
 * vinculado) y mail (si el contacto tiene email y hay SMTP configurado). Es
 * best-effort: si un canal falla, se loguea y el flujo sigue igual.
 */

function money(n: number | null | undefined): string {
  return typeof n === 'number' ? `$${n.toLocaleString('es-AR')}` : '—';
}

function fecha(iso: string | null | undefined): string {
  if (!iso) return 'a confirmar';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'a confirmar' : d.toLocaleDateString('es-AR');
}

/** Dirección publicada de una sucursal, si la conocemos. */
function direccionSucursal(sede: string | null | undefined): string | null {
  if (!sede) return null;
  return SUCURSALES.find((s) => s.nombre === sede)?.direccion ?? null;
}

/** Convierte texto plano (con **negritas**) a un HTML mínimo para el mail. */
function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*(.+?)\*/g, '<b>$1</b>');
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">${
    escaped.replace(/\n/g, '<br>')
  }</div>`;
}

/**
 * Envía una notificación por WhatsApp + mail. `waText` usa *asteriscos* para las
 * negritas (formato de WhatsApp); el mail reusa el mismo texto en HTML.
 */
async function notify(
  channel: MessagingChannel,
  contactId: string,
  subject: string,
  waText: string,
): Promise<void> {
  const contact = await getContactById(contactId);
  if (!contact) return;

  // WhatsApp (solo si el canal está vinculado).
  if (channel.getStatus().state === 'conectado' && contact.wa_id) {
    try {
      await channel.sendText(contact.wa_id, waText);
    } catch (err) {
      console.error('No se pudo notificar por WhatsApp:', err);
    }
  }

  // Mail (solo si hay email y SMTP configurado; sendMail es no-op si no).
  if (contact.email) {
    await sendMail({ to: contact.email, subject, text: waText.replace(/\*/g, ''), html: toHtml(waText) });
  }
}

/** Paso: la seña quedó aprobada. Invita a elegir sucursal y curso. */
export async function notifyPaymentApproved(
  channel: MessagingChannel, enrollment: Enrollment,
): Promise<void> {
  const curso = enrollment.course ?? 'tu curso';
  const text =
    `✅ *¡Pago de seña confirmado!*\n\n` +
    `Curso: *${curso}*\n` +
    `Seña acreditada: *${money(enrollment.payment_amount)}*\n\n` +
    `Ya podés *elegir tu sucursal y la fecha de inicio* del curso desde el mismo ` +
    `formulario de inscripción para quedar matriculado. Si tenés dudas, ` +
    `respondé este mensaje y te ayudamos. 🚗`;
  await notify(channel, enrollment.contact_id, 'Seña confirmada — Escuela STOP', text);
}

/**
 * Paso: quedó matriculado en un cohorte concreto con la SEÑA (anticipo). Avisa
 * que la inscripción está confirmada pero que debe completar el resto del pago
 * de forma presencial. NO revela el código todavía (se habilita al completar).
 */
export async function notifyMatriculado(
  channel: MessagingChannel,
  enrollment: Enrollment,
  course: TrainingCourse,
  saldo: number | null,
): Promise<void> {
  const dir = direccionSucursal(course.sede);
  const saldoLinea = saldo && saldo > 0
    ? `Saldo a completar en la sucursal: *${money(saldo)}*\n`
    : `El *resto del pago* se completa de forma presencial en la sucursal.\n`;
  const text =
    `🎓 *¡Inscripción confirmada!*\n\n` +
    `Curso: *${course.nombre}*\n` +
    `Sucursal: *${course.sede ?? '—'}*${dir ? `\n${dir}` : ''}\n` +
    `Inicio: *${fecha(course.fecha_inicio)}*\n\n` +
    `Pagaste la seña de *${money(enrollment.payment_amount)}* (anticipo). ` +
    saldoLinea +
    `\nCuando completes el pago te *habilitamos tu código de alumno* para rendir ` +
    `el examen y te lo enviamos por acá y por mail. ¡Nos vemos! 🚗`;
  await notify(channel, enrollment.contact_id, 'Inscripción confirmada — Escuela STOP', text);
}

/** Paso: se completó el pago total → se habilita y se envía el código de alumno. */
export async function notifyCodigoHabilitado(
  channel: MessagingChannel,
  enrollment: Enrollment,
  course: TrainingCourse | null,
  student: CourseStudent,
): Promise<void> {
  const nombreCurso = course?.nombre ?? enrollment.course ?? 'tu curso';
  const text =
    `✅ *¡Pago completo registrado!*\n\n` +
    `Curso: *${nombreCurso}*\n` +
    `Tu código de alumno: *${student.codigo}*\n\n` +
    `Ya está *habilitado*: guardá este código porque lo vas a usar para rendir ` +
    `el examen. ¡Éxitos! 🚗`;
  await notify(channel, enrollment.contact_id, 'Código de alumno habilitado — Escuela STOP', text);
}
