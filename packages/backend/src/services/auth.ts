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
  /** Sucursal del operador (nombre exacto, igual que enrollments.sede). NULL = admin. */
  sucursal: string | null;
  created_at: string;
}

/** Vista pública de un usuario (sin el hash de la contraseña). */
export type AdminUserPublic = Omit<AdminUser, 'password_hash'>;

const PUBLIC_COLS = 'id, email, role, sucursal, created_at';

export interface TokenPayload {
  sub: string; // id del admin
  email: string;
  role: AdminRole;
  /** Sucursal del operador; NULL/ausente para el admin (ve todas). */
  sucursal?: string | null;
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
export function signToken(payload: Pick<TokenPayload, 'sub' | 'email' | 'role' | 'sucursal'>): string {
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

/** Crea (o actualiza la contraseña/rol/sucursal de) un usuario de administración. */
export async function upsertAdmin(
  email: string,
  password: string,
  role: AdminRole = 'admin',
  sucursal: string | null = null,
): Promise<AdminUser> {
  const res = await query<AdminUser>(
    `INSERT INTO admin_users (email, password_hash, role, sucursal)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       sucursal = EXCLUDED.sucursal
     RETURNING *`,
    [email.toLowerCase().trim(), hashPassword(password), role, sucursal],
  );
  return res.rows[0];
}

// -------------------------- Gestor de usuarios -----------------------------
// CRUD para el panel (solo admin). Nunca devuelven el hash de la contraseña.

/** Error para colisiones de email al crear un usuario. */
export class EmailInUseError extends Error {
  constructor() {
    super('Ya existe un usuario con ese email');
    this.name = 'EmailInUseError';
  }
}

export async function listAdmins(): Promise<AdminUserPublic[]> {
  const res = await query<AdminUserPublic>(
    `SELECT ${PUBLIC_COLS} FROM admin_users ORDER BY role, email`,
  );
  return res.rows;
}

export async function getAdminById(id: string): Promise<AdminUserPublic | null> {
  const res = await query<AdminUserPublic>(
    `SELECT ${PUBLIC_COLS} FROM admin_users WHERE id = $1`, [id],
  );
  return res.rows[0] ?? null;
}

/** Crea un usuario nuevo. Falla si el email ya está en uso. */
export async function createAdminUser(
  email: string, password: string, role: AdminRole, sucursal: string | null,
): Promise<AdminUserPublic> {
  const existing = await findAdminByEmail(email);
  if (existing) throw new EmailInUseError();
  const res = await query<AdminUserPublic>(
    `INSERT INTO admin_users (email, password_hash, role, sucursal)
     VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC_COLS}`,
    [email.toLowerCase().trim(), hashPassword(password), role, sucursal],
  );
  return res.rows[0];
}

/** Actualiza rol, sucursal y/o contraseña de un usuario existente. */
export async function updateAdminUser(
  id: string,
  fields: { role?: AdminRole; sucursal?: string | null; password?: string },
): Promise<AdminUserPublic | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.role !== undefined) {
    values.push(fields.role);
    sets.push(`role = $${values.length}`);
  }
  if (fields.sucursal !== undefined) {
    values.push(fields.sucursal);
    sets.push(`sucursal = $${values.length}`);
  }
  if (fields.password) {
    values.push(hashPassword(fields.password));
    sets.push(`password_hash = $${values.length}`);
  }
  if (sets.length === 0) return getAdminById(id);
  values.push(id);
  const res = await query<AdminUserPublic>(
    `UPDATE admin_users SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${PUBLIC_COLS}`,
    values,
  );
  return res.rows[0] ?? null;
}

export async function deleteAdminUser(id: string): Promise<boolean> {
  const res = await query('DELETE FROM admin_users WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

/** Cantidad de administradores (para no quedarse sin ningún admin). */
export async function countAdmins(): Promise<number> {
  const res = await query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM admin_users WHERE role = 'admin'`,
  );
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Crea/actualiza el usuario admin a partir de ADMIN_EMAIL/ADMIN_PASSWORD si ambas
 * están definidas. Se llama al arrancar el backend: idempotente y no fatal, deja
 * la base con el usuario listo sin pasos manuales.
 */
export async function seedAdminFromEnv(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  try {
    const role = (process.env.ADMIN_ROLE as AdminRole) ?? 'admin';
    const sucursal = process.env.ADMIN_SUCURSAL || null;
    const user = await upsertAdmin(email, password, role, sucursal);
    console.log(`✅ Usuario admin asegurado: ${user.email} (rol: ${user.role})`);
  } catch (err) {
    console.error('No se pudo asegurar el usuario admin desde el entorno:', err);
  }
}

/** Verifica credenciales y devuelve un token de sesión, o null si son inválidas. */
export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: AdminUserPublic } | null> {
  const admin = await findAdminByEmail(email);
  if (!admin || !verifyPassword(password, admin.password_hash)) return null;
  const user: AdminUserPublic = {
    id: admin.id, email: admin.email, role: admin.role,
    sucursal: admin.sucursal, created_at: admin.created_at,
  };
  return {
    token: signToken({
      sub: admin.id, email: admin.email, role: admin.role, sucursal: admin.sucursal,
    }),
    user,
  };
}
