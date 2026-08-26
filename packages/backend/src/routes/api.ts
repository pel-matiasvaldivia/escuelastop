import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import {
  listContacts, updateContact, upsertManualContact, setBotPaused,
} from '../services/contacts.js';
import { saveDocument, listDocuments, getDocument, type DocumentKind } from '../services/documents.js';
import { getConversation, saveMessage } from '../services/messages.js';
import {
  listEnrollments, updateEnrollment, getEnrollmentByToken, createEnrollment,
  getEnrollmentById, setPaymentPending, applyPaymentStatus, saveScheduleAfterPayment,
  setLicenseInfo, listEnrollmentsByContact, resolveLicenseReview,
  registerManualPayment, type EnrollmentStatus,
} from '../services/enrollments.js';
import { evaluateLicense } from '../services/license.js';
import { extractLicenseExpiry } from '../agent/vision.js';
import { login } from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import type { MessagingChannel, MessageHandler } from '../whatsapp/channel.js';
import { COURSES, getCourse, SUCURSALES_ACTIVAS } from '../agent/catalog.js';
import { paymentProvider } from '../payments/index.js';
import { MockPaymentProvider } from '../payments/mock.js';
import { config } from '../config.js';

/**
 * Rutas REST que consume el dashboard de administración.
 * TODO (Fase 5): proteger con autenticación (admin_users) antes de producción.
 */
const UPLOAD_DIR = './uploads';
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.fieldname}${extname(file.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB por archivo
});
const DOC_FIELDS: DocumentKind[] = ['foto_licencia', 'foto_dni', 'apto_medico'];

export function makeApiRouter(
  channel: MessagingChannel,
  onIncoming: MessageHandler,
): Router {
  const router = Router();

  // ============ WhatsApp: vinculación por QR desde el panel ============
  // El QR se muestra en el dashboard (pestaña WhatsApp) para escanearlo con el
  // celular. Solo administración.
  router.get('/whatsapp/status', requireAuth, (_req, res) => {
    res.json(channel.getStatus());
  });

  // Inicia la vinculación. No esperamos a que termine: el QR aparece en el
  // estado apenas open-wa lo genera y el panel lo consulta por polling.
  router.post('/whatsapp/connect', requireAuth, (_req, res) => {
    void channel.start(onIncoming).catch((err) => {
      console.error('Error iniciando el canal de WhatsApp:', err);
    });
    res.json(channel.getStatus());
  });

  // Cierra la sesión y borra las credenciales (para vincular otro número).
  router.post('/whatsapp/logout', requireAuth, async (_req, res) => {
    await channel.logout();
    res.json(channel.getStatus());
  });

  // --- Autenticación del dashboard (pública: es el punto de entrada) ---
  router.post('/auth/login', async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email y contraseña son requeridos' });
      return;
    }
    const result = await login(email, password);
    if (!result) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }
    res.json(result);
  });

  // Devuelve el admin autenticado (para validar el token desde el dashboard).
  router.get('/auth/me', requireAuth, (req, res) => {
    res.json({ id: req.admin!.sub, email: req.admin!.email, role: req.admin!.role });
  });

  // --- Catálogo (fuente de verdad para el formulario dinámico) ---
  router.get('/catalog', (_req, res) => {
    res.json(COURSES);
  });

  // Sucursales operativas (el formulario y el alta manual arman el select con
  // esto). Debe ir ANTES de /catalog/:id o el parámetro captura la ruta.
  router.get('/catalog/sucursales', (_req, res) => {
    res.json(SUCURSALES_ACTIVAS);
  });

  router.get('/catalog/:id', (req, res) => {
    const course = getCourse(req.params.id);
    if (!course) {
      res.status(404).json({ error: 'Curso no encontrado' });
      return;
    }
    res.json(course);
  });

  // --- Contactos / Leads --- (solo administración)
  router.get('/contacts', requireAuth, async (_req, res) => {
    res.json(await listContacts());
  });

  router.patch('/contacts/:id', requireAuth, async (req, res) => {
    res.json(await updateContact(req.params.id, req.body));
  });

  // --- Conversación ---
  router.get('/contacts/:id/messages', requireAuth, async (req, res) => {
    res.json(await getConversation(req.params.id));
  });

  // Enviar mensaje directo desde el dashboard (contacto directo con el alumno).
  router.post('/contacts/:id/messages', requireAuth, async (req, res) => {
    const { waId, body } = req.body as { waId: string; body: string };
    if (!waId || !body) {
      res.status(400).json({ error: 'waId y body son requeridos' });
      return;
    }
    await channel.sendText(waId, body);
    const saved = await saveMessage(req.params.id, 'outbound', 'agent', body);
    // Handoff implícito: si un operador escribe, toma la conversación y el bot
    // deja de responder hasta que se lo reactive desde el panel.
    await setBotPaused(req.params.id, true);
    res.json(saved);
  });

  // Handoff explícito: pausar o reanudar el bot para un contacto.
  router.post('/contacts/:id/bot', requireAuth, async (req, res) => {
    const { paused } = req.body as { paused?: boolean };
    if (typeof paused !== 'boolean') {
      res.status(400).json({ error: 'Falta indicar paused (true/false)' });
      return;
    }
    res.json(await setBotPaused(req.params.id, paused));
  });

  // Inscripciones de un contacto (ficha del alumno en el panel).
  router.get('/contacts/:id/enrollments', requireAuth, async (req, res) => {
    res.json(await listEnrollmentsByContact(req.params.id));
  });

  // --- Inscripciones --- (solo administración)
  router.get('/enrollments', requireAuth, async (req, res) => {
    const status = req.query.status as EnrollmentStatus | undefined;
    res.json(await listEnrollments(status));
  });

  router.post('/enrollments', requireAuth, async (req, res) => {
    const { contactId, course, sede } = req.body as {
      contactId: string; course?: string; sede?: string;
    };
    res.json(await createEnrollment(contactId, course, sede));
  });

  router.patch('/enrollments/:id', requireAuth, async (req, res) => {
    res.json(await updateEnrollment(req.params.id, req.body));
  });

  /**
   * Inscripción cargada a mano desde el panel (alguien que llamó por teléfono o
   * vino a la sucursal). Crea/reutiliza el contacto y genera la inscripción.
   *
   * Devuelve además el link del formulario para que el alumno complete sus datos
   * y suba la documentación, sin tener que pasar por WhatsApp.
   */
  router.post('/enrollments/manual', requireAuth, async (req, res) => {
    const {
      fullName, phone, email, dni, age, courseId, sede, notes, senaCobrada,
    } = req.body as {
      fullName?: string; phone?: string; email?: string; dni?: string;
      age?: number; courseId?: string; sede?: string; notes?: string;
      senaCobrada?: boolean;
    };

    if (!fullName?.trim() || !phone?.trim()) {
      res.status(400).json({ error: 'Nombre y teléfono son requeridos' });
      return;
    }
    const course = courseId ? getCourse(courseId) : undefined;
    if (courseId && !course) {
      res.status(400).json({ error: 'Curso inválido' });
      return;
    }

    const contact = await upsertManualContact({
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email?.trim() || undefined,
      dni: dni?.trim() || undefined,
      age: age ?? undefined,
      interest: course?.name,
    });

    let enrollment = await createEnrollment(contact.id, course?.name, sede?.trim() || undefined);

    const baseNote = `📋 Inscripción cargada manualmente por ${req.admin!.email}`;
    enrollment = await updateEnrollment(enrollment.id, {
      status: 'contactado',
      notes: notes?.trim() ? `${baseNote}\n${notes.trim()}` : baseNote,
    });

    // Seña cobrada en la sucursal: se registra para que la inscripción pueda
    // avanzar a sucursal/turno sin pasar por el checkout online.
    if (senaCobrada && course?.seniaReserva) {
      const paid = await registerManualPayment(
        enrollment.id, course.seniaReserva, req.admin!.email,
      );
      if (paid) enrollment = paid;
    }

    res.json({
      contact,
      enrollment,
      formUrl: `${config.formBaseUrl}/inscripcion/${enrollment.form_token}`,
    });
  });

  // Resolución manual de un caso de licencia (aprobar o rechazar).
  router.post('/enrollments/:id/license-review', requireAuth, async (req, res) => {
    const { approve, note } = req.body as { approve?: boolean; note?: string };
    if (typeof approve !== 'boolean') {
      res.status(400).json({ error: 'Falta indicar approve (true/false)' });
      return;
    }
    const updated = await resolveLicenseReview(
      req.params.id, approve, req.admin!.email, note,
    );
    if (!updated) {
      res.status(404).json({ error: 'Inscripción no encontrada' });
      return;
    }
    res.json(updated);
  });

  // --- Formulario público prellenado (modo híbrido) ---
  // El agente envía por WhatsApp un link con el form_token; el formulario lo consume.
  router.get('/public/enrollment/:token', async (req, res) => {
    const enrollment = await getEnrollmentByToken(req.params.token);
    if (!enrollment) {
      res.status(404).json({ error: 'Inscripción no encontrada' });
      return;
    }
    res.json(enrollment);
  });

  // 1er paso del formulario: datos personales + fotos (DNI/licencia).
  // multipart/form-data. Las fotos las gestiona el FORMULARIO, no el agente.
  router.post(
    '/public/enrollment/:token/details',
    upload.fields(DOC_FIELDS.map((name) => ({ name, maxCount: 1 }))),
    async (req, res) => {
      const enrollment = await getEnrollmentByToken(req.params.token);
      if (!enrollment) {
        res.status(404).json({ error: 'Inscripción no encontrada' });
        return;
      }
      const { nombre, email, dni, edad, telefono } = req.body as Record<string, string>;
      await updateContact(enrollment.contact_id, {
        full_name: nombre, email, dni,
        age: edad ? Number(edad) : undefined,
        phone: telefono,
      });

      // Guardar los archivos subidos.
      const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      for (const kind of DOC_FIELDS) {
        const f = files[kind]?.[0];
        if (f) await saveDocument(enrollment.id, kind, f.path, f.mimetype);
      }

      // ---- Verificación de la licencia (cursos profesionales) ----
      // Si se declara vencimiento, se evalúa la regla de 90 días. Si está vencida
      // o próxima a vencer, el trámite queda 'pendiente_verificacion' y NO avanza
      // al pago: administración toma el caso.
      const { licenciaVencimiento } = req.body as { licenciaVencimiento?: string };
      if (licenciaVencimiento) {
        const expiry = new Date(licenciaVencimiento);
        if (Number.isNaN(expiry.getTime())) {
          res.status(400).json({ error: 'Fecha de vencimiento de licencia inválida' });
          return;
        }
        const evalResult = evaluateLicense(expiry);

        // Si administración ya revisó y habilitó el caso, no volvemos a frenarlo.
        if (enrollment.license_verified && evalResult.needsHumanReview) {
          res.json({ ok: true, licenseReview: false, licenseStatus: evalResult.status });
          return;
        }

        // Cotejo anti-fraude con Claude vision (best-effort, no bloquea el flujo).
        let note: string | undefined;
        const licFile = files['foto_licencia']?.[0];
        if (licFile) {
          const detected = await extractLicenseExpiry(licFile.path, licFile.mimetype);
          if (detected && detected !== licenciaVencimiento) {
            note = `⚠️ Verificar: vencimiento declarado ${licenciaVencimiento} ` +
              `≠ leído de la foto ${detected}.`;
          }
        }

        await setLicenseInfo(
          enrollment.id, licenciaVencimiento, evalResult.status,
          evalResult.needsHumanReview, note,
        );

        if (evalResult.needsHumanReview) {
          res.json({
            ok: true,
            licenseReview: true,
            licenseStatus: evalResult.status,
            daysToExpiry: evalResult.daysToExpiry,
          });
          return;
        }
      }

      res.json({ ok: true, licenseReview: false });
    },
  );

  // Documentos de una inscripción (dashboard, solo administración).
  router.get('/enrollments/:id/documents', requireAuth, async (req, res) => {
    res.json(await listDocuments(req.params.id));
  });

  // Servir un documento adjunto (dashboard, solo administración).
  router.get('/documents/:id/file', requireAuth, async (req, res) => {
    const doc = await getDocument(req.params.id);
    if (!doc) {
      res.status(404).send('No encontrado');
      return;
    }
    res.sendFile(doc.file_path, { root: process.cwd() });
  });

  // ==================== PAGO DE LA SEÑA (GATE) ====================
  // El alumno debe pagar la seña ANTES de poder elegir sucursal y turno.

  // 1) Iniciar el pago: crea la inscripción si no existe y devuelve la URL de checkout.
  router.post('/public/enrollment/:token/pay', async (req, res) => {
    const { contactId, courseId, payerEmail } = req.body as {
      contactId?: string; courseId: string; payerEmail?: string;
    };
    const course = getCourse(courseId);
    if (!course) {
      res.status(400).json({ error: 'Curso inválido' });
      return;
    }
    if (!course.seniaReserva) {
      res.status(400).json({ error: 'Este curso se coordina con la sucursal (sin seña online).' });
      return;
    }

    let enrollment = await getEnrollmentByToken(req.params.token);
    if (!enrollment) {
      if (!contactId) {
        res.status(400).json({ error: 'Falta contactId para crear la inscripción' });
        return;
      }
      enrollment = await createEnrollment(contactId, course.name);
    }

    const payment = await paymentProvider.createPayment({
      enrollmentId: enrollment.id,
      formToken: enrollment.form_token,
      amount: course.seniaReserva,
      description: `Seña de reserva — ${course.name}`,
      payerEmail,
    });
    await setPaymentPending(enrollment.id, payment.paymentId, course.seniaReserva);
    // En modo mock (MVP de prueba) el pago se aprueba solo; el frontend usa este
    // flag para no abrir el checkout y avanzar directo al turno.
    res.json({
      checkoutUrl: payment.checkoutUrl,
      formToken: enrollment.form_token,
      simulated: paymentProvider instanceof MockPaymentProvider,
    });
  });

  // 2) Consultar estado del pago (el formulario hace polling hasta 'aprobado').
  router.get('/public/enrollment/:token/payment-status', async (req, res) => {
    const enrollment = await getEnrollmentByToken(req.params.token);
    if (!enrollment) {
      res.status(404).json({ error: 'Inscripción no encontrada' });
      return;
    }
    // Si sigue pendiente, reconsultamos al proveedor por las dudas (sin webhook).
    if (enrollment.payment_status === 'pendiente' && enrollment.payment_id) {
      const status = await paymentProvider.getStatus(enrollment.payment_id);
      if (status !== 'pendiente') await applyPaymentStatus(enrollment.payment_id, status);
      res.json({ payment_status: status });
      return;
    }
    res.json({ payment_status: enrollment.payment_status });
  });

  // 3) Guardar sucursal/turno — SOLO si el pago está aprobado (gate en la query).
  router.post('/public/enrollment/:token/schedule', async (req, res) => {
    const { sede, notes } = req.body as { sede?: string; notes?: string };
    const updated = await saveScheduleAfterPayment(
      req.params.token, sede ?? null, notes ?? null,
    );
    if (!updated) {
      res.status(402).json({ error: 'Pago no confirmado. Completá la seña para elegir turno.' });
      return;
    }
    res.json(updated);
  });

  // Webhook de Mercado Pago: confirma el pago de forma asíncrona.
  router.post('/webhooks/mercadopago', async (req, res) => {
    try {
      const parsed = await paymentProvider.parseWebhook(req.body);
      if (parsed) await applyPaymentStatus(parsed.paymentId, parsed.status);
    } catch (err) {
      console.error('Error en webhook de Mercado Pago:', err);
    }
    res.sendStatus(200); // siempre 200 para que MP no reintente en loop
  });

  // Checkout SIMULADO (solo con PAYMENT_PROVIDER=mock). Aprueba el pago al confirmar.
  router.get('/public/payments/mock/:paymentId', async (req, res) => {
    if (!(paymentProvider instanceof MockPaymentProvider)) {
      res.status(404).send('No disponible');
      return;
    }
    const { paymentId } = req.params;
    const { token, confirm } = req.query as { token?: string; confirm?: string };
    if (confirm === '1') {
      paymentProvider.setStatus(paymentId, 'aprobado');
      await applyPaymentStatus(paymentId, 'aprobado');
      res.send(htmlPage('✅ Pago aprobado', 'Ya podés volver al formulario y elegir tu turno.'));
      return;
    }
    const confirmUrl =
      `${config.publicBaseUrl}/api/public/payments/mock/${paymentId}?token=${token}&confirm=1`;
    res.send(htmlPage(
      'Checkout de prueba',
      `<p>Este es un pago SIMULADO (modo desarrollo).</p>
       <a href="${confirmUrl}" style="display:inline-block;padding:12px 20px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none">Simular pago aprobado</a>`,
    ));
  });

  return router;
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title></head>
    <body style="font-family:system-ui;max-width:480px;margin:60px auto;text-align:center">
    <h2>${title}</h2>${body}</body></html>`;
}
