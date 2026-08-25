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
