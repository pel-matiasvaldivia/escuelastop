import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { KNOWLEDGE_BASE } from './knowledge.js';
import { COURSES, getCourse } from './catalog.js';
import { createEnrollment } from '../services/enrollments.js';
import { updateContact } from '../services/contacts.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const courseList = COURSES.map((c) => `- ${c.id}: ${c.name}`).join('\n');

const SYSTEM_PROMPT = `
Sos el asistente virtual de la Escuela de Manejo STOP y atendés por WhatsApp.

Tu trabajo:
1. Responder consultas sobre los cursos, requisitos, precios y forma de pago
   usando SOLO la base de conocimiento. Si un dato no está o dice "CONFIRMAR",
   no lo inventes: ofrecé contactar a un asesor humano.
2. Cuando la persona quiera AVANZAR con la inscripción a un curso, usá la
   herramienta "enviar_formulario_inscripcion" para generarle el link del
   formulario. En ese formulario la persona carga TODOS los datos, sube las fotos
   (DNI / licencia) y paga la seña. VOS NO pedís datos personales ni fotos por
   el chat: de eso se encarga el formulario.

Sobre el pago:
- Para reservar hay que pagar una SEÑA de $50.000 (para todo concepto) desde el
  formulario. El resto se paga EN EFECTIVO al asistir a la primera clase.
- La elección de sucursal y turno se habilita recién después de pagar la seña.

Estilo:
- Español rioplatense, cordial, claro y breve (mensajes cortos de WhatsApp).
- Antes de generar el formulario, identificá a qué curso se quiere inscribir.

Cursos disponibles (usá el id exacto al llamar la herramienta):
${courseList}

Base de conocimiento:
${KNOWLEDGE_BASE}
`.trim();

const tools: Anthropic.Tool[] = [
  {
    name: 'enviar_formulario_inscripcion',
    description:
      'Crea la inscripción del contacto para un curso y devuelve el LINK del ' +
      'formulario de inscripción, donde la persona carga sus datos, sube las fotos ' +
      '(DNI/licencia) y paga la seña de $50.000. Usar cuando la persona quiere ' +
      'avanzar con la inscripción a un curso concreto.',
    input_schema: {
      type: 'object',
      properties: {
        courseId: {
          type: 'string',
          description: 'Id del curso al que se quiere inscribir (de la lista de cursos).',
        },
        nombre: {
          type: 'string',
          description: 'Nombre de la persona, si lo mencionó (opcional).',
        },
      },
      required: ['courseId'],
    },
  },
];

/** Ejecuta una herramienta pedida por el modelo y devuelve el resultado en texto. */
async function runTool(name: string, input: Record<string, unknown>, contactId: string): Promise<string> {
  if (name === 'enviar_formulario_inscripcion') {
    const courseId = String(input.courseId ?? '');
    const course = getCourse(courseId);
    if (!course) return JSON.stringify({ error: 'Curso inexistente' });

    const enrollment = await createEnrollment(contactId, course.name);
    await updateContact(contactId, {
      interest: course.name,
      ...(input.nombre ? { full_name: String(input.nombre) } : {}),
    });
    const url = `${config.formBaseUrl}/inscripcion/${enrollment.form_token}`;
    return JSON.stringify({ formUrl: url, curso: course.name, senia: 50000 });
  }
  return JSON.stringify({ error: 'Herramienta desconocida' });
}

/**
 * Genera la respuesta del agente. Soporta tool-use: si el modelo decide crear la
 * inscripción, se ejecuta la herramienta y se le devuelve el resultado para que
 * redacte el mensaje final (con el link del formulario).
 */
export async function generateReply(history: ChatTurn[], contactId: string): Promise<string> {
  if (!config.anthropic.apiKey) {
    return 'El asistente no está configurado todavía (falta ANTHROPIC_API_KEY). ' +
      'Por favor escribinos a escuelastop@gmail.com.';
  }

  const messages: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role, content: t.content,
  }));

  // Hasta 3 vueltas para permitir una llamada a herramienta y su respuesta.
  for (let i = 0; i < 3; i++) {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text).join('\n').trim();
      return text || 'Disculpá, no pude procesar tu mensaje. ¿Podés reformularlo?';
    }

    // Ejecutar herramientas y realimentar el resultado.
    messages.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const result = await runTool(tu.name, tu.input as Record<string, unknown>, contactId);
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return 'Te comparto el formulario para continuar la inscripción. ' +
    'Si necesitás algo más, avisame.';
}
