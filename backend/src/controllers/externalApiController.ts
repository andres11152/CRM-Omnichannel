import { Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { AuthenticatedRequest, JsonValue } from "@/types/types";
import { Logger } from "@/utils/logger";

// Services (Layered Isolation — Controller NEVER touches Prisma)
import { contactService } from "@/services/ContactService";
import { dealService } from "@/services/DealService";
import { ticketService } from "@/services/TicketService";
import { conversationQueryService } from "@/services/ConversationQueryService";
import { conversationMessageService } from "@/services/ConversationMessageService";

// Schemas
import {
  paginationQuerySchema,
  createContactSchema,
  updateContactSchema,
  sendMessageSchema,
  createExternalDealSchema,
  idParamSchema,
} from "@/schemas/externalApiSchema";

/**
 * [EXTERNAL API] PUBLIC API CONTROLLER
 *
 * Thin controller for external consumers (API Key users).
 * All responses follow a standardized JSON envelope:
 * { status: "success"|"error", data: T, meta?: { page, limit, total } }
 *
 * Architecture:
 * - Validates input via Zod schemas
 * - Delegates to existing Services
 * - Never imports Prisma or Repositories
 */

// ============================================================================
// CONTACTS
// ============================================================================

export const listContacts = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const query = paginationQuerySchema.parse(req.query);

    const result = await contactService.findAll(companyId, {
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    res.status(200).json({
      status: "success",
      data: result.data,
      meta: result.meta,
    });
  },
);

export const getContact = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const { id } = idParamSchema.parse(req.params);

    const contact = await contactService.findOne(companyId, { id });
    if (!contact) throw new AppError("Contact not found", 404);

    res.status(200).json({ status: "success", data: contact });
  },
);


export const createContact = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const data = createContactSchema.parse(req.body);

    const contact = await contactService.upsert(companyId, {
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      tags: data.tags,
      notes: data.notes,
      customFields: data.customFields as JsonValue,
    });

    Logger.info(`[ExternalAPI] Contact created via API: ${contact.id}`, {
      companyId,
    });

    res.status(201).json({ status: "success", data: contact });
  },
);

export const updateContact = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const { id } = idParamSchema.parse(req.params);
    const data = updateContactSchema.parse(req.body);

    const updated = await contactService.update(companyId, id, {
        ...data,
        customFields: data.customFields as JsonValue | undefined,
    });

    res.status(200).json({ status: "success", data: updated });
  },
);

// ============================================================================
// MESSAGES
// ============================================================================

export const sendMessage = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const data = sendMessageSchema.parse(req.body);

    // Find or create conversation by phone
    const phone = data.to.replace(/\D/g, "");

    const result = await conversationMessageService.sendMessageToWhatsApp(
      companyId,
      "", // no specific conversation — will be resolved by phone
      req.user?.id || "api-system",
      phone,
      data.text,
    );

    Logger.info(
      `[ExternalAPI] Message sent via API to ${phone}`,
      { companyId },
    );

    res.status(200).json({
      status: "success",
      data: {
        to: phone,
        text: data.text,
        sentAt: new Date().toISOString(),
        result,
      },
    });
  },
);

// ============================================================================
// CONVERSATIONS
// ============================================================================

export const listConversations = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const conversations = await conversationQueryService.listConversations(
      companyId,
      req.user?.id || "api-system",
      "ADMIN", // API keys have admin-level access to all conversations
    );

    res.status(200).json({
      status: "success",
      data: conversations,
      meta: { total: conversations.length },
    });
  },
);

// ============================================================================
// DEALS
// ============================================================================

export const listDeals = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const deals = await dealService.getDeals(companyId, {});

    res.status(200).json({
      status: "success",
      data: deals,
      meta: { total: deals.length },
    });
  },
);

export const createDeal = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const data = createExternalDealSchema.parse(req.body);

    const deal = await dealService.createDeal(
      companyId,
      {
        title: data.title,
        value: data.value,
        currency: data.currency,
        pipelineId: data.pipelineId,
        stageId: data.stageId,
        contactId: data.contactId,
        accountId: data.accountId,
        probability: data.probability,
        expectedCloseDate: data.expectedCloseDate
          ? new Date(data.expectedCloseDate)
          : undefined,
      },
      req.user?.id,
    );

    Logger.info(`[ExternalAPI] Deal created via API: ${deal.id}`, {
      companyId,
    });

    res.status(201).json({ status: "success", data: deal });
  },
);

// ============================================================================
// TICKETS
// ============================================================================

export const listTickets = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) throw new AppError("Unauthorized", 401);

    const result = await ticketService.getAllTickets({
      companyId,
      userId: req.user?.id || "api-system",
      userRole: "ADMIN", // API keys have full visibility
    });

    res.status(200).json({
      status: "success",
      data: result.data,
      meta: result.meta,
    });
  },
);
