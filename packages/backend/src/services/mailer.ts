import nodemailer, { type Transporter } from 'nodemailer';
import { getEffectiveMail, type EffectiveMail } from './settings.js';

/**
 * Envío de mails de notificación por SMTP (nodemailer).
 *
 * La configuración sale de la pestaña "Configuración" (con prioridad) o del
 * `.env`. Es OPCIONAL: si no hay host SMTP configurado, `sendMail` no hace nada
 * (no-op) y el sistema sigue funcionando solo con las notificaciones de WhatsApp.
 *
 * El transporte se cachea por combinación de credenciales: si el admin cambia la
 * config, en el próximo envío se detecta el cambio y se recrea el transporte.
 */

let cached: { key: string; tx: Transporter } | null = null;

function mailKey(m: EffectiveMail): string {
  return [m.host, m.port, m.secure, m.user, m.pass, m.from].join('|');
}

/** Crea/reusa el transporte SMTP según la config efectiva, o null si no hay host. */
async function getTransport(): Promise<{ tx: Transporter; from: string } | null> {
  const m = await getEffectiveMail();
  if (!m.host) return null;
  const key = mailKey(m);
  if (!cached || cached.key !== key) {
    cached = {
      key,
      tx: nodemailer.createTransport({
        host: m.host,
        port: m.port,
        secure: m.secure,
        auth: m.user ? { user: m.user, pass: m.pass } : undefined,
      }),
    };
  }
  return { tx: cached.tx, from: m.from };
}

/** ¿Está configurado el envío de mails? (para logs / diagnósticos). */
export async function mailEnabled(): Promise<boolean> {
  return !!(await getEffectiveMail()).host;
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
  const t = await getTransport();
  if (!t) return false;
  try {
    await t.tx.sendMail({
      from: t.from,
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

/** Envía un mail de PRUEBA para validar la configuración SMTP. Lanza si falla. */
export async function sendTestMail(to: string): Promise<void> {
  const t = await getTransport();
  if (!t) throw new Error('No hay servidor SMTP configurado.');
  await t.tx.sendMail({
    from: t.from,
    to,
    subject: 'Prueba de configuración — Escuela STOP',
    text: 'Este es un mail de prueba. Si lo recibiste, el servidor SMTP quedó bien configurado. ✅',
  });
}
