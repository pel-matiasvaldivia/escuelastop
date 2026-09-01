import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

/**
 * Envío de mails de notificación por SMTP (nodemailer).
 *
 * Es OPCIONAL: si no hay SMTP_HOST configurado, `sendMail` no hace nada (no-op)
 * y el sistema sigue funcionando solo con las notificaciones de WhatsApp. Así el
 * mecanismo de matriculación/notificación nunca se rompe por falta de mail.
 */

let transporter: Transporter | null | undefined;

/** Crea (una sola vez) el transporte SMTP, o null si no está configurado. */
function getTransport(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (!config.mail.host) {
    transporter = null;
    console.log('ℹ️  Mail deshabilitado (falta SMTP_HOST): solo se notifica por WhatsApp.');
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  });
  return transporter;
}

/** ¿Está configurado el envío de mails? (para logs / diagnósticos). */
export function mailEnabled(): boolean {
  return !!config.mail.host;
}

export interface MailInput {
  to: string;
  subject: string;
  /** Cuerpo en texto plano (obligatorio). */
  text: string;
  /** Cuerpo HTML opcional (si falta, el cliente muestra el texto). */
  html?: string;
}

/**
 * Envía un mail. Best-effort: nunca lanza (loguea y sigue) para no cortar el
 * flujo de inscripción si el SMTP falla. Devuelve true si se envió.
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  const to = input.to?.trim();
  if (!to) return false;
  const tx = getTransport();
  if (!tx) return false;
  try {
    await tx.sendMail({
      from: config.mail.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return true;
  } catch (err) {
    console.error(`No se pudo enviar el mail a ${to}:`, err);
    return false;
  }
}
