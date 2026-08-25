/**
 * Interfaz del proveedor de pagos. Aísla al resto de la app del proveedor
 * concreto (Mercado Pago en producción; mock en desarrollo). Para cambiar de
 * proveedor basta con implementar esta interfaz.
 */

export type PaymentStatus = 'pendiente' | 'aprobado' | 'rechazado';

export interface CreatePaymentInput {
  enrollmentId: string;
  formToken: string;
  amount: number;      // ARS
  description: string; // p.ej. "Seña — Curso Particular B1"
  payerEmail?: string;
}

export interface CreatePaymentResult {
  paymentId: string;   // id/preferencia del proveedor
  checkoutUrl: string; // URL a la que redirigir al alumno para pagar
}

export interface PaymentProvider {
  /** Crea el cobro de la seña y devuelve la URL de checkout. */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Consulta el estado de un pago por su id. */
  getStatus(paymentId: string): Promise<PaymentStatus>;
  /**
   * Interpreta el payload de un webhook del proveedor y devuelve el pago afectado
   * y su estado, o null si el evento no es relevante.
   */
  parseWebhook(body: unknown): Promise<{ paymentId: string; status: PaymentStatus } | null>;
}
