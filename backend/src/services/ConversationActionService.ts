import { userRepository } from "@/repositories/UserRepository";
import { conversationRepository } from "@/repositories/ConversationRepository";
import { contactService } from "./ContactService";
import { gateway } from "@/gateways/socketGateway";
import { ticketSyncService } from "./TicketSyncService";
import { AppError } from "@/utils/AppError";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Conversation } from "@prisma/client";
import { CreateConversationDTO, ConversationWithRelations } from "@/types/conversation.types";
import { conversationMessageService } from "./ConversationMessageService";

export class ConversationActionService {
  /**
   * Orchestrates the creation of a Conversation (Shadow User + Conv + Ticket)
   */
  async createConversation(dto: CreateConversationDTO): Promise<ConversationWithRelations> {
    const { companyId, agentId, phone, name, message, addToContacts } = dto;

    // [SEC] Robust Group Detection
    const isGroup = phone.includes("@g.us") || (phone.length === 15 && phone.startsWith("120"));
    
    // Clean only if NOT a group, otherwise preserve full JID for groups
    const cleanPhone = isGroup ? phone : phone.replace(/[^\d]/g, "");
    if (!isGroup && cleanPhone.length < 5) throw new AppError("Invalid phone number", 400);

    const email = isGroup ? `${phone}@whatsapp.user` : `${cleanPhone}@whatsapp.user`;

    // A. Sync User Identity (Shadow User)
    const existingUser = await userRepository.findByEmail(email);
    const securePassword = existingUser?.password ||
      (await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10));

    const customer = await userRepository.upsertShadowUser({
      email,
      name: name || (isGroup ? `[Grupo] ${cleanPhone.slice(0, 8)}` : cleanPhone),
      phone: isGroup ? null : cleanPhone, // Never save group JID as a phone number
      companyId,
      password: securePassword,
    });

    // B. Create/Resolve Conversation (Unit of Work)
    const conversation = await conversationRepository.findOrCreate({
      companyId,
      channelId: isGroup ? cleanPhone.split("@")[0] : cleanPhone,
      customerId: customer.id,
      subject: customer.name || (isGroup ? "[Grupo]" : cleanPhone),
      status: "OPEN",
      isGroup, // Explicitly set group flag
    });

    gateway.emitToCompany(companyId, "conversation:new", conversation);

    // C. Initial Message (Async Trigger)
    if (message) {
      conversationMessageService.sendMessageToWhatsApp(
        companyId,
        conversation.id,
        agentId,
        isGroup ? `${cleanPhone.split("@")[0]}@g.us` : cleanPhone,
        message,
      );
    }

    // D. Link Contact (SKIP for groups)
    if (addToContacts && !isGroup) {
      const contact = await contactService.upsert(companyId, {
        phone: cleanPhone,
        name: name || cleanPhone,
        tags: ["Importado de Chat"],
      });
      await conversationRepository.update(companyId, conversation.id, {
        contactId: contact.id,
      });
    }

    // E. Ensure Ticket Visibility
    await ticketSyncService.ensureActiveTicket({
      companyId,
      conversationId: conversation.id,
      agentId,
      subject: name || cleanPhone,
      description: message || "Chat importado o iniciado manualmente",
    });

    // F. Return with full relations for UI consistency (No 'any' in controllers!)
    const enriched = await conversationRepository.findByIdWithRelations(companyId, conversation.id);
    if (!enriched) throw new AppError("Failed to retrieve enriched conversation", 500);

    return enriched as unknown as ConversationWithRelations;
  }

  /**
   * Status Actions
   */
  async resolveAndClose(companyId: string, id: string): Promise<Conversation> {
    return conversationRepository.update(companyId, id, {
      status: "CLOSED",
      updatedAt: new Date(),
    });
  }

  async updateTags(companyId: string, id: string, tags: string[]): Promise<Conversation> {
    return conversationRepository.updateTags(companyId, id, tags);
  }

  /**
   * Admin Config Actions
   */
  async updateSyncEnabled(companyId: string, id: string, enabled: boolean) {
    const conv = await conversationRepository.findFirst({ where: { id, companyId } });
    if (!conv) throw new AppError("Conversation not found", 404);

    if (!conv.isGroup) throw new AppError("Direct chats always sync contacts", 400);

    const updated = await conversationRepository.update(companyId, id, { syncEnabled: enabled });
    gateway.emitToCompany(companyId, "conversation:update", updated);
    return updated;
  }

  async assignToQueue(companyId: string, id: string, queueId: string | null): Promise<Conversation> {
    return conversationRepository.update(companyId, id, { queueId, updatedAt: new Date() });
  }

  async assignToAgent(companyId: string, id: string, agentId: string): Promise<Conversation> {
    return conversationRepository.update(companyId, id, { assignedToId: agentId, updatedAt: new Date() });
  }
}

export const conversationActionService = new ConversationActionService();
