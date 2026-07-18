import { Request, Response } from "express";
import { Logger } from "../utils/logger";
import { sessionManager } from "../whatsapp";
import { 
  SendMessageSchema, 
  PresenceSchema, 
  ReactionSchema, 
  EditMessageSchema, 
  RevokeMessageSchema 
} from "../schemas/message.schema";

export class MessageController {
  static async sendMessage(req: Request, res: Response): Promise<void> {
    const parseResult = SendMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.format() });
      return;
    }

    const { companyId, to, type, content, media, options } = parseResult.data;

    try {
      const activeSession = await sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        res.status(503).json({ error: `No active WhatsApp session for company: ${companyId}` });
        return;
      }

      const { sessionId, socket: sock } = activeSession;
      const { default: OutboundJidResolver } = await import("../whatsapp/OutboundJidResolver");
      const { generateMessageID } = await import("@whiskeysockets/baileys");

      const jidResolver = new OutboundJidResolver(sessionManager);
      const jid = await jidResolver.resolveDestinationJid(to, companyId, sessionId);
      const quotedMsg = (options?.quoted as unknown as import("@whiskeysockets/baileys").WAMessage) || undefined;
      const generatedId = options?.generatedMessageId || generateMessageID();

      if (jid.endsWith("@g.us")) {
        try {
          await sock.groupMetadata(jid);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          Logger.warn(`Failed to fetch group metadata: ${errMsg}`);
        }
      }

      let messageContent: import("@whiskeysockets/baileys").AnyMessageContent | null = null;
      if (type === "text" && content !== undefined) {
        messageContent = { text: content };
      } else if (type === "media" && media) {
        const urlSource = media.url ? { url: media.url } : undefined;
        if (media.type === "image") {
          messageContent = { image: urlSource, caption: media.caption, mimetype: media.mimetype };
        } else if (media.type === "video") {
          messageContent = { video: urlSource, caption: media.caption, mimetype: media.mimetype };
        } else if (media.type === "audio") {
          messageContent = { audio: urlSource, mimetype: media.mimetype, ptt: true };
        } else if (media.type === "document") {
          messageContent = { document: urlSource, mimetype: media.mimetype, fileName: media.filename, caption: media.caption };
        } else if (media.type === "sticker") {
          messageContent = { sticker: urlSource };
        } else if (media.type === "location" && media.location) {
          messageContent = {
            location: {
              degreesLatitude: media.location.latitude,
              degreesLongitude: media.location.longitude,
              name: media.location.name,
              address: media.location.address,
            },
          };
        }
      }

      if (!messageContent) {
        res.status(400).json({ error: "Invalid type or missing media content" });
        return;
      }

      const sentMsg = await sock.sendMessage(jid, messageContent, {
        messageId: generatedId,
        quoted: quotedMsg,
      });

      res.json({
        success: true,
        messageId: sentMsg?.key?.id || generatedId,
      });
    } catch (err: unknown) {
      Logger.error(err, `[MessageController] Failed to send message:`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  static async sendPresence(req: Request, res: Response): Promise<void> {
    const parseResult = PresenceSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.format() });
      return;
    }

    const { companyId, to, type } = parseResult.data;

    try {
      const activeSession = await sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        res.status(503).json({ error: "No active session" });
        return;
      }

      const { socket: sock } = activeSession;
      const { WhatsAppIdUtils } = await import("../whatsapp/utils/WhatsAppIdUtils");
      const jid = WhatsAppIdUtils.getTargetJid(to);

      await sock.sendPresenceUpdate(type as import("@whiskeysockets/baileys").WAPresence, jid);
      res.json({ success: true });
    } catch (err: unknown) {
      Logger.error(err, `[MessageController] Failed to send presence:`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  static async sendReaction(req: Request, res: Response): Promise<void> {
    const parseResult = ReactionSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.format() });
      return;
    }

    const { companyId, to, messageId, reaction, fromMe } = parseResult.data;

    try {
      const activeSession = await sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        res.status(503).json({ error: "No active session" });
        return;
      }

      const { socket: sock } = activeSession;
      const { WhatsAppIdUtils } = await import("../whatsapp/utils/WhatsAppIdUtils");
      const jid = WhatsAppIdUtils.getTargetJid(to);

      await sock.sendMessage(jid, {
        react: {
          text: reaction,
          key: {
            remoteJid: jid,
            id: messageId,
            fromMe: fromMe ?? false,
          },
        },
      });

      res.json({ success: true });
    } catch (err: unknown) {
      Logger.error(err, `[MessageController] Failed to send reaction:`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  static async editMessage(req: Request, res: Response): Promise<void> {
    const parseResult = EditMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.format() });
      return;
    }

    const { companyId, to, messageId, content } = parseResult.data;

    try {
      const activeSession = await sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        res.status(503).json({ error: "No active session" });
        return;
      }

      const { socket: sock } = activeSession;
      const { WhatsAppIdUtils } = await import("../whatsapp/utils/WhatsAppIdUtils");
      const jid = WhatsAppIdUtils.getTargetJid(to);

      await sock.sendMessage(jid, {
        edit: {
          remoteJid: jid,
          fromMe: true,
          id: messageId,
        },
        text: content,
      });

      res.json({ success: true });
    } catch (err: unknown) {
      Logger.error(err, `[MessageController] Failed to edit message:`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }

  static async revokeMessage(req: Request, res: Response): Promise<void> {
    const parseResult = RevokeMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.format() });
      return;
    }

    const { companyId, to, messageId } = parseResult.data;

    try {
      const activeSession = await sessionManager.findActiveSessionForCompany(companyId);
      if (!activeSession) {
        res.status(503).json({ error: "No active session" });
        return;
      }

      const { socket: sock } = activeSession;
      const { WhatsAppIdUtils } = await import("../whatsapp/utils/WhatsAppIdUtils");
      const jid = WhatsAppIdUtils.getTargetJid(to);

      await sock.sendMessage(jid, {
        delete: {
          remoteJid: jid,
          fromMe: true,
          id: messageId,
        },
      });

      res.json({ success: true });
    } catch (err: unknown) {
      Logger.error(err, `[MessageController] Failed to revoke message:`);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
}
