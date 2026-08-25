import { generateReply } from '../agent/agent.js';
import { getOrCreateContact } from '../services/contacts.js';
import { saveMessage, getChatHistory } from '../services/messages.js';
import type { IncomingMessage, MessagingChannel } from './channel.js';

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
    try {
      const contact = await getOrCreateContact(msg.waId, msg.phone);
      await saveMessage(contact.id, 'inbound', 'user', msg.body);

      const history = await getChatHistory(contact.id);
      const reply = await generateReply(history, contact.id);

      await saveMessage(contact.id, 'outbound', 'bot', reply);
      await channel.sendText(msg.waId, reply);
    } catch (err) {
      console.error('Error procesando mensaje entrante:', err);
    }
  };
}
