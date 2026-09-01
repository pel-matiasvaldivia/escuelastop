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
  paymentId: string;   // handle que el proveedor entiende para consultar el estado
  checkoutUrl: string; // URL a la que redirigir al alumno para pagar
}

/** Medio de pago en efectivo con cupón (redes de cobranza). */
export type CashMethod = 'rapipago' | 'pagofacil';

export interface CreateTicketResult {
  paymentId: string;  // handle para consultar el estado
  ticketUrl: string;  // URL del cupón imprimible (Rapipago / Pago Fácil)
}

export interface PaymentProvider {
  /** Crea el cobro de la seña y devuelve la URL de checkout. */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /**
   * Crea un cobro en EFECTIVO con cupón (Rapipago / Pago Fácil). El pago queda
   * pendiente hasta que la persona lo abona en la red de cobranza; ahí el webhook
   * lo confirma. Requiere el email del pagador.
   */
  createTicketPayment(input: CreatePaymentInput, method: CashMethod): Promise<CreateTicketResult>;
  /** Consulta el estado de un pago por su handle. */
  getStatus(paymentId: string): Promise<PaymentStatus>;
  /**
   * Interpreta el payload de un webhook del proveedor y devuelve el pago afectado
   * y su estado, o null si el evento no es relevante.
   */
  parseWebhook(body: unknown): Promise<{ paymentId: string; status: PaymentStatus } | null>;
}
