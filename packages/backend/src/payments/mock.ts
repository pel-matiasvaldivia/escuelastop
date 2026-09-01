import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type {
  PaymentProvider, CreatePaymentInput, CreatePaymentResult, CreateTicketResult,
  CashMethod, PaymentStatus,
} from './provider.js';

/**
 * Proveedor de pagos MOCK para desarrollo. No cobra nada: genera un checkout
 * simulado (una página del backend) que "aprueba" el pago al confirmarlo.
 * NUNCA usar en producción.
 */
export class MockPaymentProvider implements PaymentProvider {
  private statuses = new Map<string, PaymentStatus>();

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const paymentId = `mock_${randomUUID()}`;
    // MVP en modo test: el pago se aprueba automáticamente al iniciarse, para que
    // el formulario avance solo a la selección de turno sin pasos manuales. La
    // página de checkout simulada queda disponible por compatibilidad, pero el
    // estado ya es 'aprobado' desde el arranque.
    this.statuses.set(paymentId, 'aprobado');
    // Página de checkout simulada servida por el propio backend.
    const checkoutUrl =
      `${config.publicBaseUrl}/api/public/payments/mock/${paymentId}` +
      `?token=${encodeURIComponent(input.formToken)}`;
    return { paymentId, checkoutUrl };
  }

  async createTicketPayment(
    input: CreatePaymentInput, method: CashMethod,
  ): Promise<CreateTicketResult> {
    const paymentId = `mock_${randomUUID()}`;
    // A diferencia del checkout, el cupón queda PENDIENTE (simula que se paga
    // después en la red de cobranza). La misma página de checkout simulada
    // permite "aprobarlo" para probar el flujo completo.
    this.statuses.set(paymentId, 'pendiente');
    const ticketUrl =
      `${config.publicBaseUrl}/api/public/payments/mock/${paymentId}` +
      `?token=${encodeURIComponent(input.formToken)}&method=${method}`;
    return { paymentId, ticketUrl };
  }

  async getStatus(paymentId: string): Promise<PaymentStatus> {
    return this.statuses.get(paymentId) ?? 'pendiente';
  }

  /** Usado por la página de checkout simulada para forzar el estado. */
  setStatus(paymentId: string, status: PaymentStatus) {
    this.statuses.set(paymentId, status);
  }

  async parseWebhook(): Promise<null> {
    return null; // el mock no usa webhooks
  }
}
