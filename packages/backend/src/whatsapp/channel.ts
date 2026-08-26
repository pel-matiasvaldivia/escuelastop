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

/**
 * Estado de la vinculación del canal, para mostrarlo en el dashboard:
 * - apagado:    no se intentó conectar
 * - iniciando:  levantando el navegador / cargando WhatsApp Web
 * - qr:         esperando que se escanee el código QR
 * - conectado:  sesión vinculada y escuchando mensajes
 * - error:      falló el arranque (ver `error`)
 */
export type ChannelState = 'apagado' | 'iniciando' | 'qr' | 'conectado' | 'error';

export interface ChannelStatus {
  state: ChannelState;
  /** QR en formato data URI (image/png;base64) cuando state === 'qr'. */
  qr: string | null;
  /** Mensaje de error cuando state === 'error'. */
  error: string | null;
  /** Momento de la última actualización de estado (ISO). */
  updatedAt: string;
}

export interface MessagingChannel {
  /** Inicializa la conexión (en open-wa dispara el escaneo del QR). */
  start(onMessage: MessageHandler): Promise<void>;
  /** Envía un mensaje de texto a un destinatario (waId). */
  sendText(waId: string, text: string): Promise<void>;
  /** Estado actual de la vinculación (para el panel de administración). */
  getStatus(): ChannelStatus;
  /** Cierra la sesión y borra las credenciales para poder vincular otro número. */
  logout(): Promise<void>;
}
