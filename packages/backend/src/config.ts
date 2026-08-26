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
    // Apagado por defecto: el canal se vincula explícitamente desde el panel
    // (pestaña WhatsApp). Con true, además intenta conectarse al arrancar
    // reusando las credenciales guardadas.
    enabled: (process.env.WA_ENABLED ?? 'false') === 'true',
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
