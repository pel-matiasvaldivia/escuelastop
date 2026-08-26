import { generateReply } from '../agent/agent.js';
import { getOrCreateContact } from '../services/contacts.js';
import { saveMessage, getChatHistory } from '../services/messages.js';
import type { IncomingMessage, MessagingChannel } from './channel.js';

/**
 * Respuesta cuando el agente no puede contestar (sin API key, sin saldo, caída
 * del servicio). Es preferible avisar que dejar al interesado sin respuesta:
 * un lead que no recibe nada se pierde.
 */
const FALLBACK_REPLY =
  '¡Hola! Gracias por escribir a la Escuela de Manejo STOP 🚗\n\n' +
  'En este momento no puedo responderte automáticamente, pero ya registramos ' +
  'tu consulta y un asesor te va a contactar a la brevedad.';

/**
 * Orquesta una conversación entrante: persiste el mensaje, arma el historial,
 * consulta al agente y responde por el canal.
 *
 * NOTA: aquí se puede insertar el "handoff" a humano — por ejemplo, si el operador
 * marcó la conversación como atendida manualmente, el bot no debería responder.
 * Ese flag puede vivir en la tabla contacts (a agregar) o en memoria/redis.
 */
export function makeConversationHandler(channel: MessagingChannel) {
  return async function handleIncoming(msg: IncomingMessage): Promise<void> {
    let contactId: string | null = null;
    try {
      const contact = await getOrCreateContact(msg.waId, msg.phone);
      contactId = contact.id;
      await saveMessage(contact.id, 'inbound', 'user', msg.body);

      // Handoff a humano: si un operador tomó la conversación, el mensaje queda
      // registrado y visible en el panel, pero el bot no contesta.
      if (contact.bot_paused) {
        console.log(`⏸️  Bot pausado para ${msg.phone}: responde un operador.`);
        return;
      }

      const history = await getChatHistory(contact.id);
      const reply = await generateReply(history, contact.id);

      await saveMessage(contact.id, 'outbound', 'bot', reply);
      await channel.sendText(msg.waId, reply);
    } catch (err) {
      console.error('Error procesando mensaje entrante:', err);

      // El lead ya quedó registrado en la base y aparece en el panel; le avisamos
      // que lo van a contactar para no dejarlo sin respuesta.
      try {
        if (contactId) await saveMessage(contactId, 'outbound', 'bot', FALLBACK_REPLY);
        await channel.sendText(msg.waId, FALLBACK_REPLY);
      } catch (sendErr) {
        console.error('Tampoco se pudo enviar el mensaje de respaldo:', sendErr);
      }
    }
  };
}
