import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { query } from '../db/index.js';
import { config } from '../config.js';

/**
 * Autenticación del dashboard de administración.
 *
 * Sin dependencias externas: el hash de contraseñas usa scrypt y los tokens de
 * sesión son JWT (HS256) firmados con node:crypto. Suficiente y seguro para el
 * MVP; si más adelante hace falta rotación de claves o refresh tokens, se puede
 * migrar a una librería dedicada sin tocar el resto de la app.
 */

export type AdminRole = 'admin' | 'operador';

export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  created_at: string;
}

export interface TokenPayload {
  sub: string; // id del admin
  email: string;
  role: AdminRole;
  iat: number;
  exp: number;
}

// ----------------------------- Contraseñas ---------------------------------

/** Genera `scrypt$<salt>$<hash>` a partir de una contraseña en texto plano. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** Verifica una contraseña contra el hash almacenado (comparación en tiempo constante). */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// -------------------------------- Tokens -----------------------------------

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** Firma un token de sesión (JWT HS256). */
export function signToken(payload: Pick<TokenPayload, 'sub' | 'email' | 'role'>): string {
  const now = Math.floor(Date.now() / 1000);
  const body: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + config.auth.tokenTtlHours * 3600,
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = `${header}.${b64url(JSON.stringify(body))}`;
  const sig = createHmac('sha256', config.auth.jwtSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Valida firma y expiración. Devuelve el payload o null si el token no es válido. */
export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = createHmac('sha256', config.auth.jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as TokenPayload;
    if (decoded.exp && Math.floor(Date.now() / 1000) > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

// ------------------------------ Persistencia -------------------------------

export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
  const res = await query<AdminUser>('SELECT * FROM admin_users WHERE email = $1', [
    email.toLowerCase().trim(),
  ]);
  return res.rows[0] ?? null;
}

/** Crea (o actualiza la contraseña de) un usuario de administración. */
export async function upsertAdmin(
  email: string,
  password: string,
  role: AdminRole = 'admin',
): Promise<AdminUser> {
  const res = await query<AdminUser>(
    `INSERT INTO admin_users (email, password_hash, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
     RETURNING *`,
    [email.toLowerCase().trim(), hashPassword(password), role],
  );
  return res.rows[0];
}

/** Verifica credenciales y devuelve un token de sesión, o null si son inválidas. */
export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; email: string; role: AdminRole } } | null> {
  const admin = await findAdminByEmail(email);
  if (!admin || !verifyPassword(password, admin.password_hash)) return null;
  const user = { id: admin.id, email: admin.email, role: admin.role };
  return { token: signToken({ sub: admin.id, email: admin.email, role: admin.role }), user };
}
