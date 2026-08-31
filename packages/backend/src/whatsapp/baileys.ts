import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { rm } from 'node:fs/promises';
import { toDataURL } from 'qrcode';
import { config } from '../config.js';
import type {
  MessagingChannel, MessageHandler, ChannelStatus, ChannelState,
} from './channel.js';

const SESSION_PATH = './whatsapp-session';

/**
 * Logger para Baileys. Por defecto silencioso: la librería emite mucho ruido de
 * nivel error que no es accionable (p.ej. no poder descifrar los estados de los
 * contactos). El ciclo de vida útil (conectado, reconectando, QR) lo logueamos
 * nosotros. Se puede subir el detalle con WA_LOG_LEVEL para depurar.
 */
const noopLogger = {
  level: config.whatsapp.logLevel,
  fatal: () => {}, error: () => {}, warn: () => {},
  info: () => {}, debug: () => {}, trace: () => {},
  child: () => noopLogger,
};

/** Solo nos interesan los chats individuales: ni grupos, ni estados, ni newsletters. */
function shouldIgnoreJid(jid: string): boolean {
  return (
    jid === 'status@broadcast' ||
    jid.endsWith('@g.us') ||
    jid.endsWith('@broadcast') ||
    jid.endsWith('@newsletter')
  );
}

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
  /** Reintentos consecutivos de reconexión (caídas transitorias). */
  private reconnectAttempts = 0;
  /** Tope de reintentos antes de mostrar el error en el panel. */
  private static readonly MAX_RECONNECTS = 5;

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
    this.reconnectAttempts = 0;
    this.setState('iniciando', { qr: null, error: null });
    await this.connect();
  }

  private async connect(): Promise<void> {
    this.starting = true;
    try {
      // Las credenciales se persisten en disco (volumen wa_session en Docker),
      // así no hay que reescanear el QR en cada reinicio.
      const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

      // Fijamos la versión ACTUAL del protocolo de WhatsApp Web. Sin esto,
      // Baileys usa una versión embebida que queda desfasada y WhatsApp rechaza
      // el handshake (error 405 "Connection Failure") → nunca aparece el QR.
      // Es la causa nº1 de que una versión pre-release de Baileys no vincule.
      let version: [number, number, number] | undefined;
      try {
        const info = await fetchLatestBaileysVersion();
        version = info.version;
        console.log(
          `ℹ️  WhatsApp Web versión ${version.join('.')} ` +
            `(${info.isLatest ? 'al día' : 'desfasada respecto de la publicada'})`,
        );
      } catch (err) {
        // Sin internet al registro de versiones seguimos con el default embebido.
        console.warn('No se pudo obtener la versión de WhatsApp Web, usando la embebida:', err);
      }

      const sock = makeWASocket({
        auth: state,
        ...(version ? { version } : {}),
        // El QR lo publicamos nosotros en el panel, no en la terminal.
        printQRInTerminal: false,
        browser: ['Escuela STOP', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        // Evita procesar (y fallar al descifrar) estados y grupos.
        shouldIgnoreJid,
        logger: noopLogger,
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
          this.reconnectAttempts = 0;
          this.setState('conectado', { qr: null, error: null });
          console.log('✅ Canal WhatsApp (Baileys) conectado');
        }

        if (connection === 'close') {
          const boom = lastDisconnect?.error as Boom | undefined;
          const status = boom?.output?.statusCode;
          const reason = DisconnectReason[status as number] ?? 'desconocido';
          const detail = boom?.message ?? '';
          const loggedOut = status === DisconnectReason.loggedOut;

          if (this.stopping) return;

          // Log SIEMPRE (aunque el logger de Baileys esté en silent): sin esto
          // los fallos de handshake quedaban invisibles.
          console.log(
            `⚠️  WhatsApp desconectado (status ${status ?? '—'} · ${reason})` +
              (detail ? `: ${detail}` : ''),
          );

          if (loggedOut) {
            // status 401 / loggedOut: las credenciales ya no sirven (sesión
            // cerrada desde el celular, número desvinculado, o una sesión a
            // medio escribir de un intento previo). Reusarlas da 401 en loop y
            // WhatsApp nunca genera el QR: hay que BORRARLAS para arrancar limpio.
            this.reconnectAttempts = 0;
            try { this.sock?.end(undefined); } catch { /* noop */ }
            this.sock = null;
            void rm(SESSION_PATH, { recursive: true, force: true })
              .catch(() => {})
              .finally(() => {
                console.log('   sesión inválida borrada; tocá "Vincular WhatsApp" para escanear un QR nuevo');
                this.setState('apagado', {
                  qr: null,
                  error:
                    'La sesión guardada ya no era válida y se limpió. ' +
                    'Tocá "Vincular WhatsApp" para escanear el QR de nuevo.',
                });
              });
            return;
          }

          // Caída transitoria: Baileys reconecta reusando las credenciales,
          // pero con tope. Si WhatsApp rechaza el handshake (p.ej. 405), esto
          // evita el loop infinito silencioso y muestra el error en el panel.
          if (this.reconnectAttempts >= BaileysChannel.MAX_RECONNECTS) {
            this.reconnectAttempts = 0;
            this.setState('error', {
              qr: null,
              error:
                `No se pudo conectar con WhatsApp tras varios intentos ` +
                `(status ${status ?? '—'} · ${reason})` +
                (detail ? `: ${detail}` : '') +
                `. Probá "Limpiar sesión" y volvé a vincular; si persiste, ` +
                `revisá los logs del backend.`,
            });
            return;
          }

          this.reconnectAttempts += 1;
          console.log(
            `   reconectando… (intento ${this.reconnectAttempts}/${BaileysChannel.MAX_RECONNECTS})`,
          );
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
          // Ignorar mensajes propios y todo lo que no sea un chat individual.
          if (!jid || msg.key.fromMe || shouldIgnoreJid(jid)) continue;

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
