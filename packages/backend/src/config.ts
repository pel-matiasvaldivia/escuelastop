import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

// DASHBOARD_ORIGIN admite varios orígenes separados por coma (p.ej. localhost +
// producción). CORS debe reflejar UN solo origen por request, así que se guarda
// como lista y el middleware devuelve el que coincide.
const corsOrigins = (process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL', 'postgresql://stop:stop@localhost:5432/escuelastop'),
  // Primer origen (para usos que necesitan un único valor); lista completa en corsOrigins.
  dashboardOrigin: corsOrigins[0],
  corsOrigins,
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001',
  // Base pública del formulario de inscripción (el agente arma el link con esto).
  formBaseUrl: process.env.FORM_BASE_URL ?? process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000',
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  },
  whatsapp: {
    // Apagado por defecto: el bot de WhatsApp se prende explícitamente
    // (WA_ENABLED=true) para vincular el número. Así el backend arranca limpio.
    enabled: (process.env.WA_ENABLED ?? 'false') === 'true',
    sessionId: process.env.WA_SESSION_ID ?? 'escuelastop',
    headless: (process.env.WA_HEADLESS ?? 'true') === 'true',
    // Ruta a Chromium (en Docker se instala por apt); si no se define, open-wa
    // usa el navegador que descarga puppeteer.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // true dentro de contenedores (agrega --no-sandbox a Chromium).
    docker: (process.env.WA_DOCKER ?? 'false') === 'true',
    // Le dice a open-wa que use el navegador del sistema (executablePath) en
    // vez del Chromium que descarga puppeteer. Por defecto true cuando hay
    // executablePath: sin esto puppeteer intenta lanzar un binario inexistente
    // y falla con "Failed to launch the browser process! undefined".
    useChrome: (process.env.WA_USE_CHROME ?? 'true') === 'true',
    // Flags extra de Chromium, separados por coma. Vacío = usar los del preset
    // de Docker. Permite ajustar sin reconstruir la imagen (open-wa avisa que
    // ciertos flags pueden interferir con multi-device).
    chromiumArgs: (process.env.WA_CHROMIUM_ARGS ?? '')
      .split(',').map((a) => a.trim()).filter(Boolean),
  },
  payments: {
    // 'mercadopago' | 'mock' (mock aprueba al instante, solo para desarrollo)
    provider: process.env.PAYMENT_PROVIDER ?? 'mock',
    mercadopago: {
      accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    },
  },
  auth: {
    // Secreto para firmar los tokens de sesión del dashboard (HS256).
    // ⚠️ Definir JWT_SECRET en producción; el default solo sirve para desarrollo.
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-cambiar-en-produccion',
    tokenTtlHours: Number(process.env.JWT_TTL_HOURS ?? 12),
  },
};
