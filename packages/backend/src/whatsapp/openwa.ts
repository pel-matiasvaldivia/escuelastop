import { create, Client, Message as WaMessage, ChatId } from '@open-wa/wa-automate';
import { rm } from 'node:fs/promises';
import { config } from '../config.js';
import type {
  MessagingChannel, MessageHandler, ChannelStatus, ChannelState,
} from './channel.js';
import { preflightChromium, DOCKER_CHROMIUM_ARGS } from './chromium.js';

const SESSION_PATH = './whatsapp-session';

/**
 * Implementación del canal usando open-wa (WhatsApp Web no oficial).
 *
 * ⚠️ open-wa automatiza WhatsApp Web y NO es una API oficial de Meta. Va contra
 * los Términos de Servicio de WhatsApp y existe riesgo de baneo del número. Es
 * adecuado para un MVP; para producción a escala conviene migrar a Meta Cloud API
 * implementando la interfaz MessagingChannel con ese proveedor.
 *
 * El QR se captura con `catchQR` y se expone vía getStatus() para que el
 * dashboard lo muestre y el operador lo escanee desde el celular.
 */
export class OpenWaChannel implements MessagingChannel {
  private client: Client | null = null;
  private state: ChannelState = 'apagado';
  private qr: string | null = null;
  private error: string | null = null;
  private updatedAt = new Date().toISOString();
  /** Evita lanzar dos arranques en paralelo. */
  private starting: Promise<void> | null = null;

  private setState(state: ChannelState, opts: { qr?: string | null; error?: string | null } = {}) {
    this.state = state;
    if ('qr' in opts) this.qr = opts.qr ?? null;
    if ('error' in opts) this.error = opts.error ?? null;
    this.updatedAt = new Date().toISOString();
  }

  getStatus(): ChannelStatus {
    return { state: this.state, qr: this.qr, error: this.error, updatedAt: this.updatedAt };
  }

  async start(onMessage: MessageHandler): Promise<void> {
    if (this.state === 'conectado') return;
    // Si ya hay un arranque en curso, esperamos ese en vez de lanzar otro.
    if (this.starting) return this.starting;

    this.setState('iniciando', { qr: null, error: null });
    this.starting = this.launch(onMessage).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async launch(onMessage: MessageHandler): Promise<void> {
    try {
      // Preflight: si Chromium no puede arrancar, open-wa reporta un error vacío
      // ("Failed to launch the browser process! undefined"). Acá obtenemos el
      // motivo real y lo mostramos en el panel.
      if (config.whatsapp.executablePath) {
        const check = await preflightChromium(config.whatsapp.executablePath);
        if (!check.ok) {
          throw new Error(`Chromium no pudo iniciarse: ${check.detail}`);
        }
        console.log(`🌐 Chromium OK: ${check.version}`);
      }

      this.client = await create({
        sessionId: config.whatsapp.sessionId,
        headless: config.whatsapp.headless,
        qrTimeout: 0,
        authTimeout: 0,
        // La sesión (credenciales) se persiste en disco; ver .gitignore.
        sessionDataPath: SESSION_PATH,
        // Captura el QR (data URI) para mostrarlo en el dashboard.
        catchQR: (base64Qr: string) => {
          this.setState('qr', { qr: normalizeDataUri(base64Qr), error: null });
        },
        // En contenedores: usar el Chromium del sistema (executablePath) y
        // desactivar el sandbox. NO usamos useChrome (buscaría Google Chrome, que
        // no está instalado; la imagen trae chromium).
        ...(config.whatsapp.executablePath
          ? { executablePath: config.whatsapp.executablePath, useChrome: false }
          : {}),
        ...(config.whatsapp.docker ? { chromiumArgs: DOCKER_CHROMIUM_ARGS } : {}),
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

      this.setState('conectado', { qr: null, error: null });
      console.log('✅ Canal WhatsApp (open-wa) iniciado');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setState('error', { qr: null, error: message });
      throw err;
    }
  }

  async sendText(waId: string, text: string): Promise<void> {
    if (!this.client) throw new Error('El canal de WhatsApp no está iniciado');
    await this.client.sendText(waId as ChatId, text);
  }

  /** Cierra la sesión y borra las credenciales locales (para vincular otro número). */
  async logout(): Promise<void> {
    try {
      await this.client?.logout();
    } catch {
      // Si el cliente ya no responde, igual limpiamos el estado y los datos.
    }
    try {
      await this.client?.kill();
    } catch {
      /* noop */
    }
    this.client = null;
    await rm(SESSION_PATH, { recursive: true, force: true }).catch(() => {});
    this.setState('apagado', { qr: null, error: null });
  }
}

/** open-wa puede devolver el QR con o sin el prefijo data URI. */
function normalizeDataUri(qr: string): string {
  return qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
}
