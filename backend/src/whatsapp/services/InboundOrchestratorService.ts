import { WAMessage } from "@whiskeysockets/baileys";
import { User, Conversation, MediaType } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { chatService } from "@/services/ChatService";
import { WhatsAppIdUtils } from "../utils/WhatsAppIdUtils";
import { IdentityResolverService } from "./IdentityResolverService";
import { ISessionManager } from "../core/interfaces/ISessionManager";
import { ProfilePictureService } from "./ProfilePictureService";
import { groupContactIndexer } from "@/services/queue/groupContactIndexer";
import { contactRepository } from "@/repositories/ContactRepository";
import { messageRepository } from "@/repositories/MessageRepository";
import { MessageMetadata } from "@/types/whatsapp.types";
import { deduplicationService } from "./DeduplicationService";
import { companyRepository } from "@/repositories/CompanyRepository";
export interface OrchestratedEntities {
  customerUser: User | null;
  conversation: Conversation & { participants: User[] };
  isGroup: boolean;
  isFromMe: boolean;
  cleanRemoteJid: string;
  remoteJid: string;
}

export class InboundOrchestratorService {
  constructor(
    private sessionManager: ISessionManager,
    private identityResolver: IdentityResolverService,
    private profilePicService: ProfilePictureService,
  ) {}

  /**
   * ENTITY RESOLUTION
   * Resolves or creates the User and Conversation associated with an incoming message.
   */
  async resolveEntities(
    message: WAMessage,
    sessionId: string,
    companyId: string,
    sessionPhone?: string,
  ): Promise<OrchestratedEntities | null> {
    // 1. Identity Resolution
    const { cleanRemoteJid, remoteJid } = await this.identityResolver.resolveMessageJid(
      message,
      sessionId,
      companyId,
    );

    if (!cleanRemoteJid) return null;

    const isGroup = WhatsAppIdUtils.isGroup(cleanRemoteJid);
    let isFromMe = message.key.fromMe || false;

    // [DIAG] Log group message detection details
    if (isGroup) {
      Logger.info(`[Orchestrator] [DIAG] Group msg fromMe=${message.key.fromMe}, participant=${message.key.participant}, sessionPhone=${sessionPhone}`);
    }

    // Detect if "fromMe" even if Baileys doesn't report it (multi-device)
    // Checks if the sender matches our session phone
    const senderJid = this.identityResolver.resolveSenderJid(message, cleanRemoteJid, isGroup, sessionId);
    
    if (isGroup) {
      Logger.info(`[Orchestrator] [DIAG] resolveSenderJid returned: ${senderJid}`);
    }

    if (!isFromMe && senderJid) {
       const senderPhone = WhatsAppIdUtils.getPhoneNumber(senderJid);
       if (senderPhone && sessionPhone && senderPhone === sessionPhone) {
         isFromMe = true;
         Logger.info(`[Orchestrator] [OK] Detected own message via sender phone match: ${senderPhone}`);
       }
    }

    // [SEC] ASYNC FALLBACK: If still not fromMe in a group, try async LID resolution
    if (!isFromMe && isGroup && senderJid && WhatsAppIdUtils.isLid(senderJid)) {
      
      // 1. Check if the sender LID is literally OUR own session's LID
      const sock = this.sessionManager.getSession(sessionId);
      const userWithLid = sock?.user as { lid?: string, name?: string, verifiedName?: string } | undefined;
      let meLid: string | undefined;
      try {
        // Safe typed access to internal Baileys state
        const typedSock = sock as unknown as { authState?: { creds?: { me?: { lid?: string } } } };
        meLid = typedSock?.authState?.creds?.me?.lid || userWithLid?.lid;
      } catch (e) {
        // Ignored
      }
      
      const cleanSenderLid = senderJid.split("@")[0].split(":")[0];
      Logger.info(`[Orchestrator] [DIAG] LID Match Check - meLid: ${meLid}, senderLid: ${cleanSenderLid}`);

      if (meLid) {
        const cleanMeLid = meLid.split("@")[0].split(":")[0];
        if (cleanSenderLid === cleanMeLid) {
          isFromMe = true;
          Logger.info(`[Orchestrator] [OK] Detected own message via own LID match: ${cleanSenderLid} === ${cleanMeLid}`);
        }
      }

      // 2. Finally attempt active resolution if it wasn't us (or if meLid is missing)
      if (!isFromMe) {
        Logger.info(`[Orchestrator] [DIAG] Attempting async LID resolution for sender: ${senderJid}`);
        const resolvedPhone = await this.sessionManager.resolveLidToPhone(sessionId, senderJid);
        if (resolvedPhone && sessionPhone && resolvedPhone === sessionPhone) {
          isFromMe = true;
          Logger.info(`[Orchestrator] [OK] Async LID resolution matched session phone: ${resolvedPhone}`);
        }
      }

      // 3. [SEC] ULTIMATE FALLBACK: Name matching to bypass Baileys MD LID sync bug
      if (!isFromMe && message.pushName) {
        try {
          // If Baileys fails to link LID to the device, we check if the message's profile name matches OUR business name
          const companyInfo = await companyRepository.findById(companyId);
          
          const msgName = message.pushName.trim().toLowerCase();
          const compName = companyInfo?.name?.trim().toLowerCase();
          // Also check session's runtime profile name
          const sessionName = userWithLid?.name?.trim().toLowerCase() || userWithLid?.verifiedName?.trim().toLowerCase();

          if ((compName && msgName === compName) || (sessionName && msgName === sessionName)) {
            isFromMe = true;
            Logger.info(`[Orchestrator] [OK] Detected own message via pushName exact match: "${message.pushName}"`);
          }
        } catch {
           // Ignored
        }
      }
    }

    if (isGroup) {
      Logger.info(`[Orchestrator] [DIAG] Final isFromMe=${isFromMe} for group ${cleanRemoteJid}`);
    }

    // 2. Spam Gate
    if (!isFromMe && !isGroup) {
      const senderPhone = WhatsAppIdUtils.getPhoneNumber(cleanRemoteJid);
      if (senderPhone) {
        const blocked = await contactRepository.findFirst({
          where: { companyId, phone: senderPhone, isBlocked: true },
          select: { id: true },
        });
        if (blocked) {
          Logger.info(`[Orchestrator] BLOCKED: ${senderPhone}`);
          return null;
        }
      }
    }

    // 3. User Resolution
    let customerUser: User | null = null;
    const chatUniqueId = cleanRemoteJid.split("@")[0];
    // [SEC] Preserve the domain (e.g. @g.us) in the email to allow ChatIdentityService to detect groups
    const chatEmail = `${cleanRemoteJid}@whatsapp.user`;

    if (!isFromMe) {
      const senderJid = this.identityResolver.resolveSenderJid(message, cleanRemoteJid, isGroup, sessionId);
      if (senderJid) {
        const senderPhone = WhatsAppIdUtils.getPhoneNumber(senderJid);
        
        // [UX] ENTERPRISE FIX: Resolve Name with multi-strategy fallback
        // Priority: pushName > store contact > phone number
        let resolvedName = message.pushName;
        if (!resolvedName) {
           const storeContact = this.sessionManager.getContactInfo(sessionId, senderJid);
           resolvedName = storeContact?.notify || storeContact?.verifiedName || storeContact?.name;
        }

        customerUser = await chatService.upsertWhatsAppUser({
          email: `${senderJid.split("@")[0]}@whatsapp.user`,
          name: resolvedName || (senderPhone ? `+${senderPhone}` : `ID: ${senderJid.split("@")[0]}`),
          companyId,
          phone: senderPhone,
          role: "USER",
        });

        this.profilePicService.fetchAndPersist(sessionId, senderJid, customerUser.id, companyId).catch((err) => {
          Logger.warn(`[Orchestrator] Profile pic fetch failed for ${senderJid}:`, err);
        });
      }
    } else if (!isGroup) {
      const destPhone = WhatsAppIdUtils.getPhoneNumber(cleanRemoteJid);
      
      // [UX] ENTERPRISE FIX: For outbound messages (isFromMe=true), NEVER use message.pushName.
      // message.pushName for outbound = the BOT's name (e.g. "Skycode Agency"), NOT the customer's.
      // Only use store contact info or keep the existing name untouched.
      const storeContact = this.sessionManager.getContactInfo(sessionId, cleanRemoteJid);
      const resolvedName = storeContact?.notify || storeContact?.verifiedName || storeContact?.name;

      // [SEC] If we can't resolve a real name from the store, use ONLY the phone number
      // so ChatIdentityService's name preservation logic keeps the existing DB name intact.
      customerUser = await chatService.upsertWhatsAppUser({
        email: chatEmail,
        name: resolvedName || (destPhone ? `+${destPhone}` : `ID: ${chatUniqueId}`),
        companyId,
        phone: destPhone,
        role: "USER",
      });
    }

    // 4. Conversation Resolution
    // ENTERPRISE FIX: Only attempt LID-based lookup if the JID is actually a LID.
    // Running LID heuristics (name matching, brute force store) for @g.us or normal JIDs
    // risks matching the WRONG conversation (e.g., routing a group message to an individual chat).
    let conversation: (Conversation & { participants: User[] }) | null = null;

    if (WhatsAppIdUtils.isLid(cleanRemoteJid)) {
      conversation = await this.identityResolver.findConversationByLid(
        companyId,
        cleanRemoteJid,
        chatUniqueId,
        sessionId,
        message,
        isFromMe,
      ) as (Conversation & { participants: User[] }) | null;
    }

    if (!conversation) {
      const found = await chatService.findConversation(companyId, chatUniqueId, chatEmail);
      if (found) conversation = await chatService.getFullConversation(companyId, found.id) as (Conversation & { participants: User[] });
    }

    if (!conversation) {
      let conversationSubject = message.pushName || chatUniqueId;
      let groupMetadata;

      if (isGroup) {
        conversationSubject = `[Grupo] ${chatUniqueId.slice(0, 8)}...`;
        const sock = this.sessionManager.getSession(sessionId);
        if (sock) {
          try {
            const info = await sock.groupMetadata(remoteJid);
            conversationSubject = info.subject || "Grupo";

            // ENTERPRISE: Build rich participant list for sidebar display
            const participantNames = info.participants
              ?.slice(0, 10)
              .map((p) => p.id?.split("@")[0])
              .filter(Boolean);

            let groupPicUrl: string | null = null;
            try {
              groupPicUrl = await sock.profilePictureUrl(remoteJid, "image").catch(() => null);
            } catch { /* ignore */ }

            groupMetadata = {
              groupName: info.subject,
              description: info.desc,
              participantCount: info.participants?.length,
              groupPicUrl,
              participants: participantNames,
            };
          } catch (e) {
            Logger.warn(`[Orchestrator] Failed to fetch group metadata for ${remoteJid}`, e);
          }
        }
      }

      let contactId: string | undefined;
      if (!isGroup) {
        const phone = WhatsAppIdUtils.getPhoneNumber(cleanRemoteJid);
        if (phone) {
          const contact = await chatService.findContact(companyId, phone);
          contactId = contact?.id;
        }
      }

      const newConv = await chatService.createConversation({
        companyId,
        channelId: chatUniqueId,
        subject: conversationSubject,
        userId: customerUser?.id,
        contactId,
        isGroup,
        groupMetadata,
      });

      if (isGroup) {
        groupContactIndexer.queueGroupForIndexing(companyId, cleanRemoteJid, sessionId, groupMetadata?.groupName).catch((err) => {
          Logger.warn(`[Orchestrator] Failed up queue group indexing: ${cleanRemoteJid}`, err);
        });
      }

      conversation = (await chatService.getFullConversation(companyId, newConv.id)) as Conversation & { participants: User[] };
    }

    if (conversation && ["CLOSED", "RESOLVED"].includes(conversation.status)) {
      await chatService.updateConversation(companyId, conversation.id, { status: "OPEN" });
    }

    return { customerUser, conversation: conversation!, isGroup, isFromMe, cleanRemoteJid, remoteJid };
  }

  /**
   * PERSISTENCE & TICKETING
   * Saves the message to DB and ensures an active ticket exists.
   */
  async saveMessageAndTicket(params: {
    message: WAMessage;
    messageId: string;
    entities: OrchestratedEntities;
    content: { textContent: string, mediaUrl?: string, mediaType?: MediaType, mediaSize?: number };
    companyId: string;
    sessionId: string;
    sessionPhone?: string;
    defaultQueueId?: string | null;
  }) {
    const { message, messageId, entities, content, companyId, sessionPhone, defaultQueueId } = params;
    const { conversation, customerUser, isGroup, isFromMe } = entities;

    const isOutbound = isFromMe;
    let dbSenderId = customerUser?.id;

    if (isOutbound) {
      // Deduplication
      if (await this.isMessageDuplicate(companyId, conversation.id, content.textContent, messageId)) {
        return null;
      }

      // Resolve Agent/Session Owner
      dbSenderId = await this.resolveOutboundSender({
        conversation,
        sessionPhone,
        companyId,
      });
    }

    const metadata = await this.prepareMetadata(message, messageId, content, isGroup, isOutbound, companyId);

    const savedMessage = await chatService.upsertMessage({
      whatsappMessageId: messageId,
      companyId,
      content: content.textContent,
      direction: isOutbound ? "OUTBOUND" : "INBOUND",
      conversationId: conversation.id,
      senderId: dbSenderId || conversation.participants[0]?.id || "system",
      status: isOutbound ? "SENT" : "DELIVERED",
      metadata: JSON.parse(JSON.stringify(metadata)),
      createdAt: typeof message.messageTimestamp === "number" ? new Date(message.messageTimestamp * 1000) : new Date(),
    });

    let ticketId: string | undefined;
    if (!isOutbound && customerUser) {
      try {
        const ticket = await chatService.ensureTicket(
          companyId,
          conversation.id,
          customerUser.id,
          conversation.subject || "WhatsApp",
          content.textContent || "Media",
          defaultQueueId,
        );
        ticketId = ticket?.id;
      } catch (e) {
        Logger.error("[Orchestrator] Ticket creation failed", e);
      }
    } else {
      // For outbound (phone) messages, resolve the active ticket if it exists
      // to ensure frontend Query Cache alignment
      const activeTicket = await chatService.findActiveTicket(companyId, conversation.id);
      ticketId = activeTicket?.id;
    }

    return { savedMessage, ticketId };
  }

  private async isMessageDuplicate(companyId: string, conversationId: string, text: string, _messageId: string): Promise<boolean> {
    const recentThreshold = new Date(Date.now() - 10000);
    const dbDup = await messageRepository.findDuplicateOutbound(companyId, conversationId, text, recentThreshold);
    if (dbDup) return true;

    if (text && await deduplicationService.isContentDuplicate(conversationId, text)) return true;
    return false;
  }

  private async resolveOutboundSender(params: { conversation: Conversation & { assignedToId?: string | null }, sessionPhone?: string, companyId: string }): Promise<string | undefined> {
    const { conversation, sessionPhone, companyId } = params;
    if (conversation.assignedToId) return conversation.assignedToId;

    if (sessionPhone) {
      const owner = await messageRepository.getSessionOwner(sessionPhone, companyId);
      if (owner) return owner.id;
    }

    const defaultAgent = await messageRepository.getDefaultAgent(companyId);
    return defaultAgent?.id;
  }

  private async prepareMetadata(
    msg: WAMessage, 
    _id: string, 
    content: { textContent: string, mediaUrl?: string, mediaType?: MediaType, mediaSize?: number }, 
    isGroup: boolean, 
    isOutbound: boolean,
    companyId: string
  ): Promise<MessageMetadata> {
    const quotedInfo = await this.extractQuotedInfo(msg, companyId);
    return {
      messageId: _id,
      media: content.mediaType ? {
        type: content.mediaType === MediaType.IMAGE ? "image" :
              content.mediaType === MediaType.VIDEO ? "video" :
              content.mediaType === MediaType.AUDIO ? "audio" : "document",
        size: content.mediaSize,
        url: content.mediaUrl,
      } : undefined,
      origin: isOutbound ? "phone_sync" : "whatsapp",
      isGroup,
      senderJid: WhatsAppIdUtils.getSenderJid(msg) || undefined,
      ...quotedInfo,
    };
  }

  private async extractQuotedInfo(msg: WAMessage, companyId: string): Promise<{ quotedMessageId?: string, quotedParticipant?: string, quotedDbId?: string, quotedContent?: string }> {
    const ctx = msg.message?.extendedTextMessage?.contextInfo ||
                msg.message?.imageMessage?.contextInfo ||
                msg.message?.videoMessage?.contextInfo ||
                msg.message?.audioMessage?.contextInfo ||
                msg.message?.documentMessage?.contextInfo;
    
    if (!ctx?.stanzaId) return {};

    const info: { quotedMessageId: string, quotedParticipant?: string, quotedDbId?: string, quotedContent?: string } = {
      quotedMessageId: ctx.stanzaId,
      quotedParticipant: WhatsAppIdUtils.getCleanJid(ctx.participant) || undefined
    };

    // Try to find the internal DB ID for the quoted message to help the frontend
    try {
      const dbQuoted = await messageRepository.findFirst({
        where: { 
          whatsappMessageId: ctx.stanzaId,
          companyId
        },
        select: { id: true, content: true }
      });
      if (dbQuoted) {
        info.quotedDbId = dbQuoted.id;
        info.quotedMessageId = dbQuoted.id; // Override Baileys ID with DB UUID for frontend scrolling
        info.quotedContent = dbQuoted.content || "Mensaje multimedia";
      }
    } catch (_) {
      // Non-blocking
    }

    return info;
  }
}
