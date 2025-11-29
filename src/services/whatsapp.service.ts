import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { Logger } from '@/utils/logger';
import qrcode from 'qrcode-terminal';

class WhatsAppService {
  private sock: any;
  private connectionState: 'connecting' | 'open' | 'close' = 'close';

  async initialize() {
    // No iniciar una nueva conexión si ya se está conectando o está abierta
    if (this.connectionState === 'open' || this.connectionState === 'connecting') {
      Logger.info('[WhatsApp] Connection already open or connecting.');
      return;
    }

    this.connectionState = 'connecting';
    Logger.info('[WhatsApp] Initializing connection...');

    // useMultiFileAuthState guarda las credenciales en una carpeta para persistir la sesión
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false, // Lo manejaremos manually para un mejor control
      // logger: Logger as any, // Se elimina para usar el logger por defecto de Baileys y evitar conflictos
    });

    // --- MANEJO DE EVENTOS DE CONEXIÓN ---
    this.sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        Logger.info('[WhatsApp] QR Code received, scan with your phone:');
        // Imprime el QR en la terminal
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        this.connectionState = 'close';
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        Logger.error(`[WhatsApp] Connection closed due to: ${lastDisconnect?.error}, reconnecting: ${shouldReconnect}`);
        
        // Reconectar si no es un cierre de sesión explícito
        if (shouldReconnect) {
          this.initialize().catch(err => {
            Logger.error(`[WhatsApp] Failed to re-initialize after disconnection: ${err}`);
          });
        }
      } else if (connection === 'open') {
        this.connectionState = 'open';
        Logger.info('[WhatsApp] 🚀 Connection opened!');
      }
    });

    // Guardar las credenciales cada vez que se actualizan
    this.sock.ev.on('creds.update', saveCreds);

    // --- MANEJO DE MENSAJES ENTRANTES ---
    this.sock.ev.on('messages.upsert', (m: any) => {
      // Por ahora, solo mostraremos el mensaje en la consola
      Logger.info(`[WhatsApp] Received message: ${JSON.stringify(m, undefined, 2)}`);
      // Aquí es donde más adelante llamaremos al ingestionService
    });
  }
}

// Exportamos una única instancia del servicio (Singleton)
export const whatsappService = new WhatsAppService();