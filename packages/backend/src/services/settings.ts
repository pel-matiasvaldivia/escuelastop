import { query } from '../db/index.js';
import { config } from '../config.js';

/**
 * Configuración de la aplicación (una sola fila en `app_settings`).
 *
 * Los administradores la cargan desde la pestaña "Configuración". Los valores
 * guardados acá tienen PRIORIDAD sobre las variables de entorno: así la empresa
 * puede configurar SMTP y el agente de IA sin tocar el `.env` ni redeployar.
 *
 * Los secretos (smtp_pass, ai_api_key) nunca se devuelven al frontend: se
 * exponen solo como flags "*_set". Para no pegarle a la base en cada mail o
 * respuesta del agente, la fila se cachea en memoria y se invalida al guardar.
 */

export interface AppSettings {
  empresa_nombre: string | null;
  cuit: string | null;
  domicilio: string | null;
  email: string | null;
  telefono: string | null;
  logo_path: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  mail_from: string | null;
  ai_api_key: string | null;
  ai_model: string | null;
  ai_instrucciones: string | null;
  updated_at: string;
  updated_by: string | null;
}

/** Vista para el frontend: sin secretos, con flags de "está configurado". */
export interface PublicSettings {
  empresa_nombre: string | null;
  cuit: string | null;
  domicilio: string | null;
  email: string | null;
  telefono: string | null;
  logo_path: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  mail_from: string | null;
  smtp_pass_set: boolean;
  ai_model: string | null;
  ai_instrucciones: string | null;
  ai_api_key_set: boolean;
  updated_at: string;
  updated_by: string | null;
}

let cache: AppSettings | null = null;

/** Lee la fila de configuración (cacheada). Crea la fila si faltara. */
export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache;
  const res = await query<AppSettings>('SELECT * FROM app_settings WHERE singleton = TRUE');
  if (res.rows[0]) {
    cache = res.rows[0];
    return cache;
  }
  const created = await query<AppSettings>(
    'INSERT INTO app_settings (singleton) VALUES (TRUE) ON CONFLICT (singleton) DO UPDATE SET singleton = TRUE RETURNING *',
  );
  cache = created.rows[0];
  return cache;
}

/** Invalida la caché (tras un guardado). */
export function invalidateSettings(): void {
  cache = null;
}

const s = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

export async function getPublicSettings(): Promise<PublicSettings> {
  const g = await getSettings();
  return {
    empresa_nombre: g.empresa_nombre,
    cuit: g.cuit,
    domicilio: g.domicilio,
    email: g.email,
    telefono: g.telefono,
    logo_path: g.logo_path,
    smtp_host: g.smtp_host,
    smtp_port: g.smtp_port,
    smtp_secure: g.smtp_secure,
    smtp_user: g.smtp_user,
    mail_from: g.mail_from,
    smtp_pass_set: !!s(g.smtp_pass),
    ai_model: g.ai_model,
    ai_instrucciones: g.ai_instrucciones,
    ai_api_key_set: !!s(g.ai_api_key),
    updated_at: g.updated_at,
    updated_by: g.updated_by,
  };
}

/** Solo branding público (para el formulario del alumno): nada sensible. */
export async function getBranding(): Promise<{
  empresa_nombre: string | null; email: string | null;
  telefono: string | null; domicilio: string | null; logo_path: string | null;
}> {
  const g = await getSettings();
  return {
    empresa_nombre: g.empresa_nombre,
    email: g.email,
    telefono: g.telefono,
    domicilio: g.domicilio,
    logo_path: g.logo_path,
  };
}

/** Campos que un admin puede actualizar. Los secretos vacíos NO pisan el valor. */
export interface SettingsInput {
  empresa_nombre?: string | null;
  cuit?: string | null;
  domicilio?: string | null;
  email?: string | null;
  telefono?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  smtp_user?: string | null;
  smtp_pass?: string | null;   // '' o undefined = no cambiar; null = borrar
  mail_from?: string | null;
  ai_api_key?: string | null;  // '' o undefined = no cambiar; null = borrar
  ai_model?: string | null;
  ai_instrucciones?: string | null;
}

const TEXT_FIELDS: (keyof SettingsInput)[] = [
  'empresa_nombre', 'cuit', 'domicilio', 'email', 'telefono',
  'smtp_host', 'smtp_user', 'mail_from', 'ai_model', 'ai_instrucciones',
];
const SECRET_FIELDS: (keyof SettingsInput)[] = ['smtp_pass', 'ai_api_key'];

export async function updateSettings(input: SettingsInput, updatedBy: string): Promise<AppSettings> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, val: unknown) => { values.push(val); sets.push(`${col} = $${values.length}`); };

  for (const f of TEXT_FIELDS) {
    if (input[f] !== undefined) push(f, s(input[f] as string | null));
  }
  if (input.smtp_port !== undefined) push('smtp_port', input.smtp_port ?? null);
  if (input.smtp_secure !== undefined) push('smtp_secure', input.smtp_secure ?? null);

  // Secretos: string vacío/undefined => no tocar; null explícito => borrar.
  for (const f of SECRET_FIELDS) {
    const v = input[f];
    if (v === undefined) continue;
    if (v === null) push(f, null);
    else if (String(v).trim() !== '') push(f, String(v).trim());
  }

  push('updated_at', new Date().toISOString());
  push('updated_by', updatedBy);

  const res = await query<AppSettings>(
    `UPDATE app_settings SET ${sets.join(', ')} WHERE singleton = TRUE RETURNING *`,
    values,
  );
  invalidateSettings();
  return res.rows[0];
}

export async function setLogoPath(path: string, updatedBy: string): Promise<void> {
  await query(
    'UPDATE app_settings SET logo_path = $1, updated_at = now(), updated_by = $2 WHERE singleton = TRUE',
    [path, updatedBy],
  );
  invalidateSettings();
}

// -------- Valores EFECTIVOS (DB con prioridad sobre el .env) ----------------

export interface EffectiveMail {
  host: string; port: number; secure: boolean;
  user: string; pass: string; from: string;
}

export async function getEffectiveMail(): Promise<EffectiveMail> {
  const g = await getSettings();
  const host = s(g.smtp_host) ?? config.mail.host;
  const port = g.smtp_port ?? config.mail.port;
  const user = s(g.smtp_user) ?? config.mail.user;
  const pass = s(g.smtp_pass) ?? config.mail.pass;
  const secure = g.smtp_secure ?? config.mail.secure;
  const from = s(g.mail_from) ?? s(g.smtp_user) ?? config.mail.from;
  return { host, port, secure, user, pass, from };
}

export interface EffectiveAI {
  apiKey: string; model: string; instrucciones: string | null;
}

export async function getEffectiveAI(): Promise<EffectiveAI> {
  const g = await getSettings();
  return {
    apiKey: s(g.ai_api_key) ?? config.anthropic.apiKey,
    model: s(g.ai_model) ?? config.anthropic.model,
    instrucciones: s(g.ai_instrucciones),
  };
}
