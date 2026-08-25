import { Router } from 'express';
import { listContacts, updateContact } from '../services/contacts.js';
import { getConversation, saveMessage } from '../services/messages.js';
import {
  listEnrollments, updateEnrollment, getEnrollmentByToken, createEnrollment,
  type EnrollmentStatus,
} from '../services/enrollments.js';
import type { MessagingChannel } from '../whatsapp/channel.js';

/**
 * Rutas REST que consume el dashboard de administración.
 * TODO (Fase 5): proteger con autenticación (admin_users) antes de producción.
 */
export function makeApiRouter(channel: MessagingChannel): Router {
  const router = Router();

  // --- Contactos / Leads ---
  router.get('/contacts', async (_req, res) => {
    res.json(await listContacts());
  });

  router.patch('/contacts/:id', async (req, res) => {
    res.json(await updateContact(req.params.id, req.body));
  });

  // --- Conversación ---
  router.get('/contacts/:id/messages', async (req, res) => {
    res.json(await getConversation(req.params.id));
  });

  // Enviar mensaje directo desde el dashboard (contacto directo con el alumno).
  router.post('/contacts/:id/messages', async (req, res) => {
    const { waId, body } = req.body as { waId: string; body: string };
    if (!waId || !body) {
      res.status(400).json({ error: 'waId y body son requeridos' });
      return;
    }
    await channel.sendText(waId, body);
    const saved = await saveMessage(req.params.id, 'outbound', 'agent', body);
    res.json(saved);
  });

  // --- Inscripciones ---
  router.get('/enrollments', async (req, res) => {
    const status = req.query.status as EnrollmentStatus | undefined;
    res.json(await listEnrollments(status));
  });

  router.post('/enrollments', async (req, res) => {
    const { contactId, course, sede } = req.body as {
      contactId: string; course?: string; sede?: string;
    };
    res.json(await createEnrollment(contactId, course, sede));
  });

  router.patch('/enrollments/:id', async (req, res) => {
    res.json(await updateEnrollment(req.params.id, req.body));
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

  return router;
}
