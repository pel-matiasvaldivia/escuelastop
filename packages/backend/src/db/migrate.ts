import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './index.js';

// Aplica schema.sql contra la base configurada. Útil cuando la base ya existe
// y no se recreó vía docker-entrypoint.
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('✅ Esquema aplicado correctamente');
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Error aplicando el esquema:', err);
  process.exit(1);
});
