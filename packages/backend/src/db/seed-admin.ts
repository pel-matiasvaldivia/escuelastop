import 'dotenv/config';
import { pool } from './index.js';
import { upsertAdmin } from '../services/auth.js';

/**
 * Crea (o actualiza) el usuario de administración del dashboard.
 *
 * Uso:
 *   ADMIN_EMAIL=admin@escuelastop.com.ar ADMIN_PASSWORD=una-clave-segura \
 *     npm run seed:admin --workspace @escuelastop/backend
 *
 * Si no se pasan variables, usa credenciales de desarrollo (cambiar en producción).
 */
async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@escuelastop.com.ar';
  const password = process.env.ADMIN_PASSWORD ?? 'stop-admin-2024';
  const role = (process.env.ADMIN_ROLE as 'admin' | 'operador') ?? 'admin';

  const user = await upsertAdmin(email, password, role);
  console.log(`✅ Usuario de administración listo: ${user.email} (rol: ${user.role})`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('⚠️  Se usó la contraseña por defecto. Definí ADMIN_PASSWORD en producción.');
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Error creando el usuario de administración:', err);
  process.exit(1);
});
