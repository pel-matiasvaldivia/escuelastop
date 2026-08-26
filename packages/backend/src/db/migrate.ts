import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * schema.sql vive junto al fuente; en la imagen compilada el código corre desde
 * dist/, así que probamos ambas ubicaciones.
 */
function findSchema(): string {
  const candidates = [
    join(__dirname, 'schema.sql'),           // dev (src/db) y dist con copia
    join(__dirname, '../../src/db/schema.sql'), // dist/db -> src/db
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`No se encontró schema.sql (buscado en: ${candidates.join(', ')})`);
  return found;
}

/**
 * Aplica schema.sql. Todo el DDL es idempotente (CREATE ... IF NOT EXISTS /
 * ADD COLUMN IF NOT EXISTS), así que puede correrse en cada arranque para que
 * las bases existentes incorporen las columnas nuevas.
 */
export async function runMigrations(): Promise<void> {
  const sql = readFileSync(findSchema(), 'utf8');
  await pool.query(sql);
}

// Ejecución directa: npm run db:migrate
if (process.argv[1] && process.argv[1].includes('migrate')) {
  runMigrations()
    .then(async () => {
      console.log('✅ Esquema aplicado correctamente');
      await pool.end();
    })
    .catch((err) => {
      console.error('❌ Error aplicando el esquema:', err);
      process.exit(1);
    });
}
