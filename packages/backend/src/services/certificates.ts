import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
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

/**
 * Serialización CANÓNICA de los datos con orden de campos FIJO.
 *
 * `datos` se guarda como JSONB y Postgres NO conserva el orden de las claves (las
 * reordena al almacenarlas). Si firmáramos/verificáramos con `JSON.stringify` del
 * objeto tal cual sale de la base, el orden diferiría del de emisión y el HMAC no
 * coincidiría nunca. Reconstruyendo el objeto en un orden fijo, la firma es estable
 * sin importar cómo el JSONB reordene las claves.
 */
function canonicalDatos(d: CertificateData): CertificateData {
  return {
    alumno: d.alumno,
    dni: d.dni,
    curso: d.curso,
    categoria: d.categoria ?? null,
    sede: d.sede ?? null,
    nota: d.nota ?? null,
    instructor: d.instructor ?? null,
    fecha_curso: d.fecha_curso ?? null,
    fecha_emision: d.fecha_emision,
  };
}

/** Firma electrónica: HMAC-SHA256 del contenido canónico con el secreto del server. */
function firmar(serial: string, datos: CertificateData): string {
  const canonical = JSON.stringify({ serial, datos: canonicalDatos(datos) });
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

export async function getById(id: string): Promise<Certificate | null> {
  const res = await query<Certificate>('SELECT * FROM certificates WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

// ------------------------------ PDF ----------------------------------------

const NAVY = '#131a27';
const RED = '#d42f2f';
const GRAY = '#5b6472';

/**
 * Genera el PDF del certificado (A4 apaisado) con el QR de verificación
 * embebido. Server-side con pdfkit: no necesita navegador ni fuentes externas.
 */
export async function renderPdf(cert: Certificate): Promise<Buffer> {
  const d = cert.datos;
  const url = verifyUrl(cert.codigo_verif);
  const qrPng = await QRCode.toBuffer(url, { margin: 1, width: 320 });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;   // ~841.89
  const H = doc.page.height;  // ~595.28

  // Marco decorativo.
  doc.rect(0, 0, W, H).fill('#ffffff');
  doc.lineWidth(3).strokeColor(NAVY).rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(1).strokeColor(RED).rect(34, 34, W - 68, H - 68).stroke();

  // Encabezado.
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15)
    .text('ESCUELA DE MANEJO STOP', 0, 66, { align: 'center' });
  doc.fillColor(GRAY).font('Helvetica').fontSize(10)
    .text('Mendoza, Argentina', { align: 'center' });

  doc.fillColor(RED).font('Helvetica-Bold').fontSize(30)
    .text('CERTIFICADO DE APROBACIÓN', 0, 120, { align: 'center' });

  // Cuerpo.
  doc.fillColor(GRAY).font('Helvetica').fontSize(13)
    .text('Se certifica que', 0, 190, { align: 'center' });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(26)
    .text(d.alumno, 0, 212, { align: 'center' });
  doc.fillColor(GRAY).font('Helvetica').fontSize(12)
    .text(`DNI ${d.dni}`, 0, 246, { align: 'center' });

  const cat = d.categoria ? ` (categoría ${d.categoria})` : '';
  const nota = d.nota !== null && d.nota !== undefined ? ` con una calificación de ${d.nota}%` : '';
  doc.fillColor(NAVY).font('Helvetica').fontSize(14)
    .text(`aprobó satisfactoriamente el curso`, 0, 278, { align: 'center' });
  doc.font('Helvetica-Bold').fontSize(16)
    .text(`${d.curso}${cat}`, 60, 300, { align: 'center', width: W - 120 });
  if (nota) {
    doc.font('Helvetica').fontSize(12).fillColor(GRAY)
      .text(nota.trim(), 0, 328, { align: 'center' });
  }

  // Pie: datos y firma.
  const baseY = H - 150;
  doc.fillColor(GRAY).font('Helvetica').fontSize(10);
  const fecha = d.fecha_emision ? new Date(d.fecha_emision).toLocaleDateString('es-AR') : '';
  doc.text(`Sucursal: ${d.sede ?? '—'}`, 70, baseY);
  doc.text(`Instructor: ${d.instructor ?? '—'}`, 70, baseY + 16);
  doc.text(`Fecha de emisión: ${fecha}`, 70, baseY + 32);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11)
    .text(`Certificado N.º ${cert.serial}`, 70, baseY + 52);

  // QR de verificación (abajo a la derecha).
  const qrSize = 96;
  const qrX = W - 70 - qrSize;
  const qrY = baseY - 8;
  doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });
  doc.fillColor(GRAY).font('Helvetica').fontSize(8)
    .text('Verificá la autenticidad', qrX - 20, qrY + qrSize + 4, { width: qrSize + 40, align: 'center' });

  if (cert.anulado) {
    doc.fillColor(RED).font('Helvetica-Bold').fontSize(60).opacity(0.25)
      .text('ANULADO', 0, H / 2 - 30, { align: 'center' });
    doc.opacity(1);
  }

  doc.end();
  return done;
}
