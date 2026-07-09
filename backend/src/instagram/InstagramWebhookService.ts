import { Channel } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { DistributedLock } from "@/utils/distributedLock";
import { instagramSessionRepository } from "@/instagram/InstagramSessionRepository";
import { instagramProviderService } from "@/instagram/InstagramProviderService";
import { instagramMediaService } from "@/instagram/InstagramMediaService";
import { instagramContactResolver } from "@/instagram/InstagramContactResolver";
import {
  userResolver,
  conversationResolver,
  messagePersister,
  socketEmitter,
} from "@/services/messageProcessing";
import { webhookDispatcher } from "@/services/WebhookDispatcher";
import type { IdentityResult } from "@/utils/contactStrategy";
import type { MessagingMediaPayload } from "@/types/message.types";

// ─── Instagram Messaging API webhook payload shape ───
export interface InstagramMessagePayload {
  mid: string;
  text?: string;
  is_echo?: boolean;
  attachments?: Array<{
    type: string;
    payload?: { url?: string };
  }>;
}

export interface InstagramMessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: InstagramMessagePayload;
}

export interface InstagramWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: InstagramMessagingEvent[];
  }>;
}

export class InstagramWebhookService {
  /**
   * [ORCHESTRATOR] Processes a validated Instagram Messaging webhook payload
   * end-to-end, reusing the exact same Conversation/User/Message pipeline
   * that the WhatsApp (Baileys) inbound flow uses — see
   * MessageProcessorService._processSafeInternal — so tickets, sockets and
   * the agent panel behave identically regardless of channel.
   */
  async processIncomingMessage(body: InstagramWebhookBody): Promise<void> {
    if (body.object !== "instagram") return;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        try {
          await this.processEvent(event);
        } catch (error) {
          Logger.error("[InstagramWebhook] Failed to process messaging event", error);
        }
      }
    }
  }

  private async processEvent(event: InstagramMessagingEvent): Promise<void> {
    const igsid = event?.sender?.id;
    const igBusinessAccountId = event?.recipient?.id;
    const message = event?.message;

    if (!igsid || !igBusinessAccountId || !message) return;
    // Echoes are copies of OUR OWN outbound messages relayed back through the
    // webhook — skip them, they are already persisted by the outbound path.
    if (message.is_echo) return;

    const lockKey = `conv:instagram:${igBusinessAccountId}:${igsid}`;
    await DistributedLock.run(
      lockKey,
      async () => this.handleMessage(igBusinessAccountId, igsid, message),
      5000,
      10000,
    );
  }

  private async handleMessage(
    igBusinessAccountId: string,
    igsid: string,
    message: InstagramMessagePayload,
  ): Promise<void> {
    // 1. RESOLVE TENANT: Map Instagram Business Account ID → companyId
    const session = await instagramSessionRepository.findActiveSessionByIgAccountId(igBusinessAccountId);
    if (!session) {
      Logger.warn(
        `[InstagramWebhook] No active session found for IG Business Account: ${igBusinessAccountId}. Dropping message.`,
      );
      return;
    }
    const { companyId } = session;

    Logger.info(`[InstagramWebhook] [INBOUND] Message from ${igsid} | Company: ${companyId}`);

    // 2. IDENTITY: Best-effort profile lookup (name/username)
    const profile = await instagramProviderService.getUserProfile(igBusinessAccountId, igsid);
    const displayName = profile.name || profile.username || `Instagram User ${igsid}`;
    const identity: IdentityResult = {
      contactName: profile.name || profile.username,
      subjectDisplayName: displayName,
      hasValidName: !!(profile.name || profile.username),
    };

    // 3. CONTACT
    const contact = await instagramContactResolver.resolve({
      companyId,
      igsid,
      name: profile.name,
      username: profile.username,
    });

    // 4. SHADOW USER
    const user = await userResolver.resolve({
      companyId,
      phone: igsid,
      identity,
      isOutbound: false,
      domain: "instagram.user",
    });

    // 5. CONVERSATION + TICKET
    const conversation = await conversationResolver.resolve({
      companyId,
      phone: igsid,
      identity,
      isOutbound: false,
      sessionId: igBusinessAccountId,
      contactId: contact.id,
      userId: user.id,
      channel: Channel.INSTAGRAM_DM,
    });

    // 6. MEDIA (best-effort — a failure here still lets the text/placeholder through)
    let media: MessagingMediaPayload | undefined;
    const attachment = message.attachments?.[0];
    if (attachment?.payload?.url) {
      try {
        const processed = await instagramMediaService.processMedia(
          attachment.payload.url,
          undefined,
          companyId,
          attachment.type,
        );
        media = { url: processed.url, type: processed.type };
      } catch (error) {
        Logger.error(`[InstagramWebhook] Media processing failed for ${igsid}`, error);
      }
    }

    const text = message.text || (media ? `[${media.type.toUpperCase()}]` : "");

    // 7. PERSIST MESSAGE (deduplicated by instagramMessageId)
    const newMessage = await messagePersister.persist({
      companyId,
      conversationId: conversation.id,
      text,
      isOutbound: false,
      senderId: user.id,
      hasMedia: !!media,
      media,
      contactId: contact.id,
      messageId: message.mid,
      channel: Channel.INSTAGRAM_DM,
    });

    if (!newMessage) return; // Duplicate — skip events

    // 8. SOCKET (real-time panel update)
    socketEmitter.emit(conversation, newMessage, identity.subjectDisplayName, companyId, false, user.id, user);

    // 9. DEVELOPER WEBHOOKS (external integrations)
    webhookDispatcher.dispatch(companyId, "message.received", {
      messageId: newMessage.id,
      conversationId: conversation.id,
      contactId: contact.id,
      content: text,
      channel: "INSTAGRAM_DM",
      direction: "INBOUND",
      source: "instagram_messaging_api",
    });

    Logger.info(`[InstagramWebhook] [OK] Message saved: ${newMessage.id} → Conversation ${conversation.id}`);
  }
}

export const instagramWebhookService = new InstagramWebhookService();
