import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { OpenWaChannel } from './whatsapp/openwa.js';
import { makeConversationHandler } from './whatsapp/conversation.js';
import { makeApiRouter } from './routes/api.js';
import { seedAdminFromEnv } from './services/auth.js';

async function main() {
  const channel = new OpenWaChannel();

  // Asegura el usuario admin (ADMIN_EMAIL/ADMIN_PASSWORD) si están definidos.
  await seedAdminFromEnv();

  // --- API HTTP para el dashboard ---
  const app = express();
  app.use(cors({ origin: config.dashboardOrigin }));
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', makeApiRouter(channel));

  app.listen(config.port, () => {
    console.log(`✅ API escuchando en http://localhost:${config.port}`);
  });

  // --- Canal de WhatsApp ---
  // Escaneá el QR que aparece en la consola la primera vez para vincular el número.
  const handleIncoming = makeConversationHandler(channel);
  await channel.start(handleIncoming).catch((err) => {
    console.error('No se pudo iniciar el canal de WhatsApp:', err);
    console.error('La API sigue funcionando; el bot de WhatsApp no está activo.');
  });
}

main().catch((err) => {
  console.error('Error fatal al iniciar el backend:', err);
  process.exit(1);
});
