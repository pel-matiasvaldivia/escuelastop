import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { KNOWLEDGE_BASE } from './knowledge.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `
Sos el asistente virtual de la Escuela de Manejo STOP y atendés por WhatsApp.
Tu objetivo es responder consultas sobre los cursos e inscripciones y DERIVAR a la
persona hacia la inscripción, captando de forma amable sus datos básicos.

Reglas:
- Respondé SIEMPRE en español rioplatense, con tono cordial, claro y breve
  (WhatsApp: mensajes cortos, sin párrafos largos).
- Usá EXCLUSIVAMENTE la información de la base de conocimiento. Si un dato no está
  o dice "CONFIRMAR", no lo inventes: ofrecé contactar a un asesor humano.
- Flujo objetivo (modo híbrido): 1) resolvé la consulta; 2) si hay interés,
  pedí de a poco nombre completo, DNI, edad, sede preferida y curso de interés;
  3) cuando tengas lo básico, avisá que le vas a enviar un enlace para completar la
  inscripción.
- Antes de guardar datos personales, pedí consentimiento para tratarlos según la
  Ley 25.326 de Protección de Datos Personales (Argentina).
- Si la persona pide hablar con un humano, confirmá que derivás la conversación a
  un asesor.

Base de conocimiento:
${KNOWLEDGE_BASE}
`.trim();

/**
 * Genera la respuesta del agente dado el historial de la conversación.
 */
export async function generateReply(history: ChatTurn[]): Promise<string> {
  if (!config.anthropic.apiKey) {
    return 'El asistente no está configurado todavía (falta ANTHROPIC_API_KEY). ' +
      'Por favor escribinos a escuelastop@gmail.com.';
  }

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: history.map((t) => ({ role: t.role, content: t.content })),
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return text || 'Disculpá, no pude procesar tu mensaje. ¿Podés reformularlo?';
}
