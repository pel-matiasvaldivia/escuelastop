/**
 * Interfaz del canal de mensajería. Aísla al resto de la app del proveedor
 * concreto (open-wa hoy; Meta Cloud API el día de mañana). Para migrar, basta
 * con implementar esta interfaz con otro proveedor.
 */
export interface IncomingMessage {
  waId: string;   // identificador del remitente (54911...@c.us en open-wa)
  phone: string;  // número normalizado (+54911...)
  body: string;   // texto del mensaje
}

export type MessageHandler = (msg: IncomingMessage) => Promise<void>;

export interface MessagingChannel {
  /** Inicializa la conexión (en open-wa dispara el escaneo del QR). */
  start(onMessage: MessageHandler): Promise<void>;
  /** Envía un mensaje de texto a un destinatario (waId). */
  sendText(waId: string, text: string): Promise<void>;
}
