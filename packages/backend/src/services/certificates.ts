import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { query } from '../db/index.js';
import { config } from '../config.js';

/**
 * Certificados del curso (Fase 2) con FIRMA ELECTRÓNICA + QR verificable.
 *
 * No se usa firma digital con certificado de una Autoridad Certificante (Ley
 * 25.506), sino firma electrónica: se calcula un HMAC-SHA256 del contenido del
 * certificado con el secreto del servidor. Ese HMAC (`firma`) garantiza que los
 * datos no se alteraron. El PDF lleva un QR con la URL pública de verificación
 * (`/verificar/<codigo_verif>`), donde cualquiera puede confirmar que el
 * certificado es auténtico y ver sus datos.
 */

export interface CertificateData {
  alumno: string;
  dni: string;
  curso: string;
  categoria: string | null;
  sede: string | null;
  nota: number | null;
  instructor: string | null;
  fecha_curso: string | null;
  fecha_emision: string;
}

export interface Certificate {
  id: string;
  course_student_id: string;
  serial: string;
  codigo_verif: string;
  firma: string;
  datos: CertificateData;
  emitido_por: string;
  emitido_at: string;
  anulado: boolean;
}

/** Firma electrónica: HMAC-SHA256 del contenido canónico con el secreto del server. */
function firmar(serial: string, datos: CertificateData): string {
  const canonical = JSON.stringify({ serial, datos });
  return createHmac('sha256', config.auth.jwtSecret).update(canonical).digest('hex');
}

/** Número de serie legible y correlativo: STOP-<año>-<6 dígitos>. */
async function siguienteSerial(): Promise<string> {
  const year = new Date().getFullYear();
  const res = await query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM certificates WHERE serial LIKE $1`,
    [`STOP-${year}-%`],
  );
  const n = Number(res.rows[0]?.n ?? 0) + 1;
  return `STOP-${year}-${String(n).padStart(6, '0')}`;
}

/**
 * Emite el certificado de un alumno. Idempotente por alumno: si ya existe uno
 * vigente, lo devuelve en lugar de duplicarlo.
 */
export async function emitirCertificado(
  courseStudentId: string, datos: CertificateData, emitidoPor: string,
): Promise<Certificate> {
  const existente = await getByStudent(courseStudentId);
  if (existente && !existente.anulado) return existente;

  const serial = await siguienteSerial();
  const codigoVerif = randomBytes(16).toString('hex');
  const firma = firmar(serial, datos);

  const res = await query<Certificate>(
    `INSERT INTO certificates
       (course_student_id, serial, codigo_verif, firma, datos, emitido_por)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING *`,
    [courseStudentId, serial, codigoVerif, firma, JSON.stringify(datos), emitidoPor],
  );
  return res.rows[0];
}

export async function getByStudent(courseStudentId: string): Promise<Certificate | null> {
  const res = await query<Certificate>(
    'SELECT * FROM certificates WHERE course_student_id = $1 ORDER BY emitido_at DESC LIMIT 1',
    [courseStudentId],
  );
  return res.rows[0] ?? null;
}

/** URL pública que se codifica en el QR del certificado. */
export function verifyUrl(codigoVerif: string): string {
  return `${config.formBaseUrl}/verificar/${codigoVerif}`;
}

/**
 * Verificación pública (la que abre el QR). Recalcula la firma y confirma que el
 * contenido no fue alterado. No expone datos sensibles más allá de los del
 * certificado.
 */
export async function verificar(codigoVerif: string): Promise<
  | { valido: true; anulado: boolean; serial: string; datos: CertificateData; emitido_at: string }
  | { valido: false }
> {
  const res = await query<Certificate>(
    'SELECT * FROM certificates WHERE codigo_verif = $1', [codigoVerif],
  );
  const cert = res.rows[0];
  if (!cert) return { valido: false };

  const esperada = firmar(cert.serial, cert.datos);
  const a = Buffer.from(cert.firma);
  const b = Buffer.from(esperada);
  const integro = a.length === b.length && timingSafeEqual(a, b);
  if (!integro) return { valido: false };

  return {
    valido: true,
    anulado: cert.anulado,
    serial: cert.serial,
    datos: cert.datos,
    emitido_at: cert.emitido_at,
  };
}

export async function anular(id: string): Promise<boolean> {
  const res = await query('UPDATE certificates SET anulado = TRUE WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}
