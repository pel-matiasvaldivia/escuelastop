import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type {
  PaymentProvider, CreatePaymentInput, CreatePaymentResult, CreateTicketResult,
  CashMethod, PaymentStatus,
} from './provider.js';

/**
 * Proveedor de pagos con Mercado Pago.
 *
 * - Seña con tarjeta / dinero en cuenta: Checkout Pro (preferencia + init_point).
 * - Seña en efectivo: cupón de Rapipago / Pago Fácil (API de pagos), que la
 *   persona abona en la red de cobranza; el pago queda pendiente hasta entonces.
 *
 * El HANDLE que guardamos como payment_id es el `external_reference` = id de la
 * inscripción. Así:
 *  - el polling consulta el estado buscando pagos por external_reference, y
 *  - el webhook (que trae el id de pago de MP) resuelve el external_reference y
 *    devuelve ESE handle, que matchea con lo guardado.
 * Esto evita el desajuste entre "id de preferencia" e "id de pago".
 *
 * Requiere MP_ACCESS_TOKEN. Docs:
 *  - https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing
 *  - https://www.mercadopago.com.ar/developers/es/docs/checkout-api/payment-methods/other-payment-methods
 */
export class MercadoPagoProvider implements PaymentProvider {
  private token = config.payments.mercadopago.accessToken;

  private mapStatus(mpStatus: string): PaymentStatus {
    if (mpStatus === 'approved') return 'aprobado';
    if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'rechazado';
    return 'pendiente';
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.token) throw new Error('Falta MP_ACCESS_TOKEN');

    const backUrl = `${config.publicBaseUrl}/api/public/payments/return?token=${input.formToken}`;
    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        items: [{
          title: input.description,
          quantity: 1,
          unit_price: input.amount,
          currency_id: 'ARS',
        }],
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
        external_reference: input.enrollmentId,
        back_urls: { success: backUrl, pending: backUrl, failure: backUrl },
        auto_return: 'approved',
        notification_url: `${config.publicBaseUrl}/api/webhooks/mercadopago`,
      }),
    });

    if (!res.ok) {
      throw new Error(`Mercado Pago: error creando preferencia (${res.status})`);
    }
    const data = (await res.json()) as { id: string; init_point: string };
    // El handle es el external_reference (id de inscripción), no el de preferencia.
    return { paymentId: input.enrollmentId, checkoutUrl: data.init_point };
  }

  async createTicketPayment(
    input: CreatePaymentInput, method: CashMethod,
  ): Promise<CreateTicketResult> {
    if (!this.token) throw new Error('Falta MP_ACCESS_TOKEN');
    if (!input.payerEmail) {
      throw new Error('Para pagar en efectivo (Rapipago / Pago Fácil) necesitás un email.');
    }

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: this.authHeaders({
        'Content-Type': 'application/json',
        // Clave de idempotencia: evita duplicar el cobro ante reintentos.
        'X-Idempotency-Key': randomUUID(),
      }),
      body: JSON.stringify({
        transaction_amount: input.amount,
        description: input.description,
        payment_method_id: method, // 'rapipago' | 'pagofacil'
        external_reference: input.enrollmentId,
        payer: { email: input.payerEmail },
        notification_url: `${config.publicBaseUrl}/api/webhooks/mercadopago`,
      }),
    });

    if (!res.ok) {
      throw new Error(`Mercado Pago: error creando el cupón de pago (${res.status})`);
    }
    const data = (await res.json()) as {
      id: number;
      point_of_interaction?: { transaction_data?: { ticket_url?: string } };
      transaction_details?: { external_resource_url?: string };
    };
    const ticketUrl =
      data.point_of_interaction?.transaction_data?.ticket_url ??
      data.transaction_details?.external_resource_url;
    if (!ticketUrl) {
      throw new Error('Mercado Pago no devolvió la URL del cupón.');
    }
    return { paymentId: input.enrollmentId, ticketUrl };
  }

  async getStatus(paymentId: string): Promise<PaymentStatus> {
    if (!this.token) throw new Error('Falta MP_ACCESS_TOKEN');
    // paymentId es el external_reference (id de inscripción): buscamos el pago
    // más reciente asociado y devolvemos su estado.
    const url = `https://api.mercadopago.com/v1/payments/search` +
      `?external_reference=${encodeURIComponent(paymentId)}&sort=date_created&criteria=desc`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) return 'pendiente';
    const data = (await res.json()) as { results?: { status: string }[] };
    const latest = data.results?.[0];
    return latest ? this.mapStatus(latest.status) : 'pendiente';
  }

  async parseWebhook(body: unknown): Promise<{ paymentId: string; status: PaymentStatus } | null> {
    // MP envía { type: 'payment', data: { id } }. Consultamos el pago para leer
    // su external_reference (nuestro handle) y su estado.
    const evt = body as { type?: string; data?: { id?: string | number } };
    if (evt?.type !== 'payment' || evt.data?.id == null) return null;
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${evt.data.id}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; external_reference?: string };
    if (!data.external_reference) return null;
    return { paymentId: data.external_reference, status: this.mapStatus(data.status) };
  }
}
