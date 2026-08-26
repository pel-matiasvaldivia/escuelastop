import { query } from '../db/index.js';

export interface Contact {
  id: string;
  wa_id: string;
  phone: string | null;
  full_name: string | null;
  email: string | null;
  dni: string | null;
  age: number | null;
  preferred_sede: string | null;
  interest: string | null;
  consent_given: boolean;
  created_at: string;
  updated_at: string;
}

/** Busca un contacto por su wa_id o lo crea si no existe. */
export async function getOrCreateContact(waId: string, phone?: string): Promise<Contact> {
  const existing = await query<Contact>('SELECT * FROM contacts WHERE wa_id = $1', [waId]);
  if (existing.rows[0]) return existing.rows[0];

  const created = await query<Contact>(
    'INSERT INTO contacts (wa_id, phone) VALUES ($1, $2) RETURNING *',
    [waId, phone ?? null],
  );
  return created.rows[0];
}

/**
 * Normaliza un teléfono a solo dígitos en formato internacional argentino.
 * "0261 15 123-4567" / "+54 9 261 1234567" -> "5492611234567".
 * Es conservador: si ya viene con código de país, lo respeta.
 */
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits.startsWith('54')) digits = `54${digits}`;
  return digits;
}

/**
 * Crea (o reutiliza) el contacto de una inscripción cargada a mano desde el
 * panel — por ejemplo alguien que llamó por teléfono o vino a la sucursal.
 *
 * El wa_id se arma con el teléfono normalizado en el mismo formato que usa
 * WhatsApp, así que si después esa persona escribe por WhatsApp cae sobre el
 * MISMO contacto en vez de duplicarse.
 */
export async function upsertManualContact(data: {
  fullName: string;
  phone: string;
  email?: string;
  dni?: string;
  age?: number;
  interest?: string;
}): Promise<Contact> {
  const digits = normalizePhone(data.phone);
  const waId = `${digits}@s.whatsapp.net`;

  // Buscar por wa_id o por teléfono ya guardado (con cualquier formato).
  const existing = await query<Contact>(
    `SELECT * FROM contacts
     WHERE wa_id = $1 OR regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2
     LIMIT 1`,
    [waId, digits],
  );

  const fields = {
    full_name: data.fullName,
    phone: digits,
    email: data.email,
    dni: data.dni,
    age: data.age,
    interest: data.interest,
  };

  if (existing.rows[0]) return updateContact(existing.rows[0].id, fields);

  const created = await query<Contact>(
    `INSERT INTO contacts (wa_id, phone, full_name, email, dni, age, interest)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [waId, digits, data.fullName, data.email ?? null, data.dni ?? null,
     data.age ?? null, data.interest ?? null],
  );
  return created.rows[0];
}

export async function listContacts(): Promise<Contact[]> {
  const res = await query<Contact>('SELECT * FROM contacts ORDER BY updated_at DESC LIMIT 200');
  return res.rows;
}

export async function updateContact(id: string, fields: Partial<Contact>): Promise<Contact> {
  const allowed: (keyof Contact)[] = [
    'phone', 'full_name', 'email', 'dni', 'age', 'preferred_sede', 'interest', 'consent_given',
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (sets.length === 0) {
    const res = await query<Contact>('SELECT * FROM contacts WHERE id = $1', [id]);
    return res.rows[0];
  }
  values.push(id);
  const res = await query<Contact>(
    `UPDATE contacts SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  return res.rows[0];
}
