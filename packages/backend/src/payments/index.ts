import { config } from '../config.js';
import type { PaymentProvider } from './provider.js';
import { MockPaymentProvider } from './mock.js';
import { MercadoPagoProvider } from './mercadopago.js';

/** Instancia única del proveedor de pagos según configuración. */
export const paymentProvider: PaymentProvider =
  config.payments.provider === 'mercadopago'
    ? new MercadoPagoProvider()
    : new MockPaymentProvider();

export * from './provider.js';
