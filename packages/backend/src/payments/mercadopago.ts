import { config } from '../config.js';
import type {
  PaymentProvider, CreatePaymentInput, CreatePaymentResult, PaymentStatus,
} from './provider.js';

/**
 * Proveedor de pagos con Mercado Pago (Checkout Pro).
 *
 * Requiere MP_ACCESS_TOKEN. Crea una "preferencia" de pago y devuelve el
 * init_point (URL de checkout). El estado se confirma vía webhook
 * (POST /api/webhooks/mercadopago) o consultando el pago por id.
 *
 * Docs: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing
 *
 * NOTA: implementación con fetch directo a la API REST para no atar el proyecto
 * a una versión del SDK. Revisar/ajustar contra la doc vigente antes de producción.
 */
export class MercadoPagoProvider implements PaymentProvider {
  private token = config.payments.mercadopago.accessToken;

  private mapStatus(mpStatus: string): PaymentStatus {
    if (mpStatus === 'approved') return 'aprobado';
    if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'rechazado';
    return 'pendiente';
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (!this.token) throw new Error('Falta MP_ACCESS_TOKEN');

    const backUrl = `${config.publicBaseUrl}/api/public/payments/return?token=${input.formToken}`;
    const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
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
    return { paymentId: data.id, checkoutUrl: data.init_point };
  }

  async getStatus(paymentId: string): Promise<PaymentStatus> {
    if (!this.token) throw new Error('Falta MP_ACCESS_TOKEN');
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) return 'pendiente';
    const data = (await res.json()) as { status: string };
    return this.mapStatus(data.status);
  }

  async parseWebhook(body: unknown): Promise<{ paymentId: string; status: PaymentStatus } | null> {
    // MP envía { type: 'payment', data: { id } }. Consultamos el pago para el estado.
    const evt = body as { type?: string; data?: { id?: string } };
    if (evt?.type !== 'payment' || !evt.data?.id) return null;
    const paymentId = String(evt.data.id);
    const status = await this.getStatus(paymentId);
    return { paymentId, status };
  }
}
