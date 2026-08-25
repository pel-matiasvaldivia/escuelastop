import { create, Client, Message as WaMessage } from '@open-wa/wa-automate';
import { config } from '../config.js';
import type { MessagingChannel, MessageHandler } from './channel.js';

/**
 * Implementación del canal usando open-wa (WhatsApp Web no oficial).
 *
 * ⚠️ open-wa automatiza WhatsApp Web y NO es una API oficial de Meta. Va contra
 * los Términos de Servicio de WhatsApp y existe riesgo de baneo del número. Es
 * adecuado para un MVP; para producción a escala conviene migrar a Meta Cloud API
 * implementando la interfaz MessagingChannel con ese proveedor.
 */
export class OpenWaChannel implements MessagingChannel {
  private client: Client | null = null;

  async start(onMessage: MessageHandler): Promise<void> {
    this.client = await create({
      sessionId: config.whatsapp.sessionId,
      headless: config.whatsapp.headless,
      qrTimeout: 0,
      authTimeout: 0,
      // La sesión (credenciales) se persiste en disco; ver .gitignore.
      sessionDataPath: './whatsapp-session',
    });

    this.client.onMessage(async (message: WaMessage) => {
      // Ignorar mensajes de grupos y no-texto para el MVP.
      if (message.isGroupMsg || message.type !== 'chat') return;

      await onMessage({
        waId: message.from,
        phone: message.sender?.id?.replace('@c.us', '') ?? message.from,
        body: message.body ?? '',
      });
    });

    console.log('✅ Canal WhatsApp (open-wa) iniciado');
  }

  async sendText(waId: string, text: string): Promise<void> {
    if (!this.client) throw new Error('El canal de WhatsApp no está iniciado');
    await this.client.sendText(waId, text);
  }
}
