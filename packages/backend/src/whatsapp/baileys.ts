import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { rm } from 'node:fs/promises';
import { toDataURL } from 'qrcode';
import type {
  MessagingChannel, MessageHandler, ChannelStatus, ChannelState,
} from './channel.js';

const SESSION_PATH = './whatsapp-session';

/**
 * Canal de WhatsApp con Baileys.
 *
 * A diferencia de open-wa, Baileys habla el protocolo multi-device por WebSocket:
 * no necesita navegador ni Chromium, es mucho más liviano y se mantiene al día
 * con los cambios de WhatsApp.
 *
 * ⚠️ Sigue siendo un cliente NO oficial: va contra los Términos de Servicio de
 * WhatsApp y existe riesgo de baneo del número. Para producción a escala conviene
 * migrar a la Meta Cloud API implementando esta misma interfaz.
 */
export class BaileysChannel implements MessagingChannel {
  private sock: WASocket | null = null;
  private state: ChannelState = 'apagado';
  private qr: string | null = null;
  private error: string | null = null;
  private updatedAt = new Date().toISOString();
  private handler: MessageHandler | null = null;
  private starting = false;
  /** Cortar la reconexión automática cuando el operador desvincula a propósito. */
  private stopping = false;

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
    this.handler = onMessage;
    if (this.state === 'conectado' || this.starting) return;
    this.stopping = false;
    this.setState('iniciando', { qr: null, error: null });
    await this.connect();
  }

  private async connect(): Promise<void> {
    this.starting = true;
    try {
      // Las credenciales se persisten en disco (volumen wa_session en Docker),
      // así no hay que reescanear el QR en cada reinicio.
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

      const sock = makeWASocket({
        auth: state,
        // El QR lo publicamos nosotros en el panel, no en la terminal.
        printQRInTerminal: false,
        browser: ['Escuela STOP', 'Chrome', '1.0.0'],
        syncFullHistory: false,
      });
      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          // Baileys entrega el QR como string; lo convertimos a imagen para el panel.
          toDataURL(qr, { margin: 1, width: 320 })
            .then((dataUrl) => this.setState('qr', { qr: dataUrl, error: null }))
            .catch((err) => console.error('No se pudo generar la imagen del QR:', err));
        }

        if (connection === 'open') {
          this.setState('conectado', { qr: null, error: null });
          console.log('✅ Canal WhatsApp (Baileys) conectado');
        }

        if (connection === 'close') {
          const status = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
          const loggedOut = status === DisconnectReason.loggedOut;

          if (this.stopping) return;

          if (loggedOut) {
            // La sesión ya no sirve: hay que volver a escanear el QR.
            this.setState('apagado', {
              qr: null,
              error: 'La sesión se cerró desde el celular. Volvé a vincular el número.',
            });
            return;
          }

          // Caída transitoria: Baileys reconecta reusando las credenciales.
          console.log('⚠️  WhatsApp desconectado, reconectando…');
          this.setState('iniciando', { qr: null });
          void this.connect().catch((err) => {
            this.setState('error', { error: err instanceof Error ? err.message : String(err) });
          });
        }
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          const jid = msg.key.remoteJid;
          // Ignorar mensajes propios, de grupos y de estados.
          if (!jid || msg.key.fromMe || jid.endsWith('@g.us') || jid === 'status@broadcast') continue;

          const body =
            msg.message?.conversation ??
            msg.message?.extendedTextMessage?.text ??
            '';
          if (!body.trim()) continue; // solo texto en el MVP

          await this.handler?.({
            waId: jid,
            phone: jid.split('@')[0],
            body,
          });
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setState('error', { qr: null, error: message });
      throw err;
    } finally {
      this.starting = false;
    }
  }

  async sendText(waId: string, text: string): Promise<void> {
    if (!this.sock || this.state !== 'conectado') {
      throw new Error('El canal de WhatsApp no está conectado');
    }
    await this.sock.sendMessage(waId, { text });
  }

  /** Cierra la sesión y borra las credenciales para poder vincular otro número. */
  async logout(): Promise<void> {
    this.stopping = true;
    try {
      await this.sock?.logout();
    } catch {
      // Si el socket ya está caído, igual limpiamos credenciales y estado.
    }
    try {
      this.sock?.end(undefined);
    } catch {
      /* noop */
    }
    this.sock = null;
    await rm(SESSION_PATH, { recursive: true, force: true }).catch(() => {});
    this.setState('apagado', { qr: null, error: null });
  }
}
