import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

type SupportedMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
function normalizeMime(mime?: string): SupportedMime {
  if (mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif') return mime;
  return 'image/jpeg';
}

/**
 * Lee la foto de la licencia con Claude y extrae la fecha de vencimiento.
 * Best-effort: devuelve null si no hay API key, no puede leerla, o falla.
 * Se usa para COTEJAR la fecha declarada por el alumno (anti-fraude/typos),
 * no como fuente única de verdad.
 */
export async function extractLicenseExpiry(
  imagePath: string, mimeType?: string,
): Promise<string | null> {
  if (!config.anthropic.apiKey) return null;
  try {
    const base64 = readFileSync(imagePath).toString('base64');
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: normalizeMime(mimeType), data: base64 },
          },
          {
            type: 'text',
            text:
              'Esta es una foto de una licencia de conducir argentina. Devolvé SOLO la ' +
              'fecha de vencimiento en formato ISO YYYY-MM-DD, sin ningún otro texto. ' +
              'Si no podés leerla con seguridad, devolvé exactamente "null".',
          },
        ],
      }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim();
    const match = text.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  } catch {
    return null;
  }
}
