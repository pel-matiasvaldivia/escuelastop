import { query } from '../db/index.js';

export type DocumentKind = 'foto_licencia' | 'foto_dni' | 'apto_medico';

export interface Document {
  id: string;
  enrollment_id: string;
  kind: DocumentKind;
  file_path: string;
  mime_type: string | null;
  uploaded_at: string;
}

export async function saveDocument(
  enrollmentId: string, kind: DocumentKind, filePath: string, mimeType?: string,
): Promise<Document> {
  const res = await query<Document>(
    `INSERT INTO documents (enrollment_id, kind, file_path, mime_type)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [enrollmentId, kind, filePath, mimeType ?? null],
  );
  return res.rows[0];
}

export async function listDocuments(enrollmentId: string): Promise<Document[]> {
  const res = await query<Document>(
    'SELECT * FROM documents WHERE enrollment_id = $1 ORDER BY uploaded_at',
    [enrollmentId],
  );
  return res.rows;
}

export async function getDocument(id: string): Promise<Document | null> {
  const res = await query<Document>('SELECT * FROM documents WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}
