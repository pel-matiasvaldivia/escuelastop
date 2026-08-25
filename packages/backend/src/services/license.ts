/** Evaluación de vigencia de la licencia de conducir. */

export type LicenseStatus = 'vigente' | 'proxima' | 'vencida';

/** Días de antelación con los que se considera "próxima a vencer". */
export const LICENSE_WARNING_DAYS = 90;

export interface LicenseEvaluation {
  status: LicenseStatus;
  /** true si requiere verificación humana (vencida o próxima a vencer). */
  needsHumanReview: boolean;
  daysToExpiry: number;
}

/**
 * Evalúa la vigencia según la fecha de vencimiento.
 * - vencida:  la fecha ya pasó.
 * - proxima:  vence dentro de los próximos LICENSE_WARNING_DAYS días.
 * - vigente:  vence en más de LICENSE_WARNING_DAYS días.
 * Cualquier estado distinto de 'vigente' requiere verificación humana.
 */
export function evaluateLicense(expiry: Date, now: Date = new Date()): LicenseEvaluation {
  // Normalizamos a medianoche para contar días completos.
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysToExpiry = Math.floor((startOfDay(expiry) - startOfDay(now)) / msPerDay);

  let status: LicenseStatus;
  if (daysToExpiry < 0) status = 'vencida';
  else if (daysToExpiry <= LICENSE_WARNING_DAYS) status = 'proxima';
  else status = 'vigente';

  return { status, needsHumanReview: status !== 'vigente', daysToExpiry };
}
