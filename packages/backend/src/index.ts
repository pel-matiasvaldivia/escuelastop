import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { BaileysChannel } from './whatsapp/baileys.js';
import { makeConversationHandler } from './whatsapp/conversation.js';
import { makeApiRouter } from './routes/api.js';
import { seedAdminFromEnv } from './services/auth.js';
import { runMigrations } from './db/migrate.js';

async function main() {
  const channel = new BaileysChannel();

  // Aplica el esquema (DDL idempotente): crea tablas nuevas y agrega columnas
  // faltantes en bases ya existentes. No es fatal si falla.
  await runMigrations()
    .then(() => console.log('✅ Esquema de base de datos al día'))
    .catch((err) => console.error('No se pudo aplicar el esquema:', err));

  // Asegura el usuario admin (ADMIN_EMAIL/ADMIN_PASSWORD) si están definidos.
  await seedAdminFromEnv();

  // Handler de mensajes entrantes (lo usa el canal cuando está vinculado).
  const handleIncoming = makeConversationHandler(channel);

  // --- API HTTP para el dashboard ---
  const app = express();
  // CORS: refleja el origen solicitado si está en la lista permitida.
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', makeApiRouter(channel, handleIncoming));

  app.listen(config.port, () => {
    console.log(`✅ API escuchando en http://localhost:${config.port}`);
  });

  // --- Canal de WhatsApp (opt-in) ---
  // Se arranca solo con WA_ENABLED=true. Escaneá el QR de la consola la primera
  // vez para vincular el número.
  if (config.whatsapp.enabled) {
    await channel.start(handleIncoming).catch((err) => {
      console.error('No se pudo iniciar el canal de WhatsApp:', err);
      console.error('La API sigue funcionando; el bot de WhatsApp no está activo.');
    });
  } else {
    console.log(
      'ℹ️  WhatsApp no se inicia automáticamente (WA_ENABLED != true). ' +
        'Podés vincularlo desde el panel: pestaña WhatsApp.',
    );
  }
}

main().catch((err) => {
  console.error('Error fatal al iniciar el backend:', err);
  process.exit(1);
});
