import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL', 'postgresql://stop:stop@localhost:5432/escuelastop'),
  dashboardOrigin: process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001',
  // Base pública del formulario de inscripción (el agente arma el link con esto).
  formBaseUrl: process.env.FORM_BASE_URL ?? process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000',
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  },
  whatsapp: {
    sessionId: process.env.WA_SESSION_ID ?? 'escuelastop',
    headless: (process.env.WA_HEADLESS ?? 'true') === 'true',
  },
  payments: {
    // 'mercadopago' | 'mock' (mock aprueba al instante, solo para desarrollo)
    provider: process.env.PAYMENT_PROVIDER ?? 'mock',
    mercadopago: {
      accessToken: process.env.MP_ACCESS_TOKEN ?? '',
    },
  },
};
