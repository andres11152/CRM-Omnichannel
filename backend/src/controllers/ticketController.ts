import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/database";
import { cacheService } from "@/services/cacheService";
import { TicketPriority, TicketStatus, Prisma } from "@prisma/client";
import { AuthenticatedRequest } from "@/types/types";
import { gateway } from "@/gateways/socketGateway";
import { webhookDispatcher } from "@/services/webhookDispatcher";
import {
  toTicketDTO,
  TicketWithRelations,
  TicketDTO,
} from "@/types/ticket.types";

// --- HELPERS ---
// (Legacy mapTicketToFrontend removed in favor of toTicketDTO)

/**
 * Helper to enrich TicketDTOs with CRM Contact Data AND WhatsApp Session Index
 * This keeps the controller clean and focuses on business integration logic
 *
 * 🎯 100-YEAR FIX: Maps each ticket to its corresponding WhatsApp session (#1, #2, #3)
 * based on the phone number of the connected WhatsApp session.
 */
const enrichWithCrmData = async (
  dtos: TicketDTO[],
  companyId: string,
): Promise<TicketDTO[]> => {
  const phonesToFetch = new Set<string>();
  dtos.forEach((t) => {
    if (t.contact.phone) phonesToFetch.add(t.contact.phone);
  });

  // 📱 PERFORMANCE: Cache connected sessions for 60s (reduces DB hits on every ticket list refresh)
  // 📱 PERFORMANCE: Cache connected sessions for 60s (reduces DB hits on every ticket list refresh)
  let whatsappSessions;
  try {
    whatsappSessions = await cacheService.wrap(
      `company:${companyId}:sessions:connected:v1`,
      () =>
        prisma.whatsAppSession.findMany({
          where: { companyId, status: "CONNECTED" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            phone: true,
            sessionId: true,
            defaultQueueId: true,
          },
        }),
      5, // Short cache TTL (5s) for better real-time status
    );
  } catch (cacheError) {
    // 🛡️ REDIS FALLBACK: If cache fails, query DB directly
    console.warn(
      "[TicketController] Cache failed, fetching directly:",
      cacheError,
    );
    whatsappSessions = await prisma.whatsAppSession.findMany({
      where: { companyId, status: "CONNECTED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        phone: true,
        sessionId: true,
        defaultQueueId: true,
      },
    });
  }

  // Build maps for resolution
  const sessionIndexMap = new Map<string, number>(); // Phone -> Index
  const queueToSessionDataMap = new Map<
    string,
    { index: number; phone: string | null }
  >(); // QueueId -> {index, phone}

  // 📱 Map sessions to queues and phone numbers
  whatsappSessions.forEach((session, index) => {
    const sessionIdx = index + 1;

    if (session.phone) {
      const normalizedPhone = session.phone.replace(/^\+/, "");
      sessionIndexMap.set(normalizedPhone, sessionIdx);
    }

    if (session.defaultQueueId) {
      queueToSessionDataMap.set(session.defaultQueueId, {
        index: sessionIdx,
        phone: session.phone,
      });
    }
  });

  if (phonesToFetch.size === 0 && whatsappSessions.length === 0) return dtos;

  const contacts = await prisma.contact.findMany({
    where: {
      companyId,
      phone: { in: Array.from(phonesToFetch) },
    },
    select: { id: true, phone: true, name: true, avatarUrl: true, tags: true },
  });

  const crmMap = new Map<string, (typeof contacts)[0]>();
  contacts.forEach((c) => {
    if (c.phone) crmMap.set(c.phone, c);
  });

  return dtos.map((dto) => {
    const crmData = dto.contact.phone
      ? crmMap.get(dto.contact.phone)
      : undefined;

    // 📱 Determine WhatsApp session index & phone
    let whatsappSessionIndex: number | undefined;
    let whatsappSessionPhone: string | undefined;

    // Strategy 1: Match by Queue ID
    if (dto.queueId && queueToSessionDataMap.has(dto.queueId)) {
      const data = queueToSessionDataMap.get(dto.queueId);
      whatsappSessionIndex = data?.index;
      whatsappSessionPhone = data?.phone || undefined;
    }

    // Strategy 2: Default logic (Single Session Fallback)
    if (!whatsappSessionIndex && whatsappSessions.length > 0) {
      if (whatsappSessions.length === 1) {
        whatsappSessionIndex = 1;
        whatsappSessionPhone = whatsappSessions[0].phone || undefined;
      }
    }

    if (crmData) {
      // 🛡️ CRM Data takes precedence
      return {
        ...dto,
        // 🔄 SYNC TAGS: Use Contact tags as source of truth if available
        tags: crmData.tags && crmData.tags.length > 0 ? crmData.tags : dto.tags,
        contact: {
          ...dto.contact,
          realContactId: crmData.id,
          name:
            crmData.name && crmData.name !== dto.contact.phone
              ? crmData.name
              : dto.contact.name,
          avatarUrl: crmData.avatarUrl || dto.contact.avatarUrl,
          whatsappSessionIndex, // 📱 Add session index
          whatsappSessionPhone, // 📞 Add session phone
        },
      };
    }

    return {
      ...dto,
      contact: {
        ...dto.contact,
        whatsappSessionIndex, // 📱 Add session index even without CRM data
        whatsappSessionPhone, // 📞 Add session phone
      },
    };
  });
};

export const createTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { subject, description, priority, queueId, assignedToId, status } =
      req.body;
    const companyId = req.companyId || req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return next(new AppError("Company ID or User ID missing", 400));
    }

    // Get next ticket number for this company
    const lastTicket = await prisma.ticket.findFirst({
      where: { companyId },
      orderBy: { ticketNumber: "desc" },
      select: { ticketNumber: true },
    });

    const nextTicketNumber = (lastTicket?.ticketNumber || 0) + 1;

    const newTicket = await prisma.ticket.create({
      data: {
        subject,
        description,
        ticketNumber: nextTicketNumber,
        priority: priority || "MEDIUM",
        status: status || "OPEN",
        companyId,
        createdById: userId,
        queueId: queueId || null,
        assignedToId: assignedToId || null,
      },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            participants: true,
          },
        },
      },
    });

    // Auto-assignment trigger
    if (newTicket.queueId && !newTicket.assignedToId) {
      // We can run this in background or await it.
      // For responsiveness, let's await it but catch errors so we don't fail the request.
      try {
        const { assignTicketToAgent } =
          await import("@/services/autoAssignmentService");
        await assignTicketToAgent(newTicket.id, newTicket.queueId);
        // We might want to re-fetch the ticket to return the assigned agent
        // But for now, returning the initial state is fine, frontend will see update via socket or refresh.
      } catch (error) {
        console.error("Auto-assignment failed:", error);
      }
    }

    // 🕸️ WEBHOOK DISPATCH
    // We send payload as we return it
    const ticketDTO = toTicketDTO(newTicket as unknown as TicketWithRelations);

    webhookDispatcher
      .dispatch(companyId, "ticket.created", ticketDTO)
      .catch((err) => console.error("Webhook trigger failed", err));

    res.status(201).json({
      status: "success",
      data: { ticket: ticketDTO },
    });
  },
);

/**
 * GET ALL TICKETS
 */
export const getAllTickets = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const startTime = Date.now();
    const companyId = req.companyId || req.user?.companyId;
    const { status, priority, queueId, assignedToId } = req.query;

    console.log(
      `[TicketController] 🕒 Start getAllTickets for company: ${companyId}`,
    );

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { tickets: [] } });
    }

    const where: Prisma.TicketWhereInput = { companyId };

    if (status) where.status = status as TicketStatus;
    if (priority) where.priority = priority as TicketPriority;
    if (queueId) where.queueId = queueId as string;
    if (assignedToId) where.assignedToId = assignedToId as string;

    if (req.user?.role === "AGENT") {
      const qStart = Date.now();
      const agent = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { queues: { select: { id: true } } },
      });
      const agentQueueIds = agent?.queues.map((q) => q.id) || [];
      console.log(
        `[TicketController] 🕒 Agent queues fetched in ${Date.now() - qStart}ms`,
      );

      where.AND = [
        {
          OR: [
            { conversation: { is: null } },
            { conversation: { isGroup: false } },
          ],
        },
        {
          OR: [
            { assignedToId: req.user.id },
            {
              assignedToId: null,
              queueId: { in: agentQueueIds },
            },
          ],
        },
      ];
    }

    const dbStart = Date.now();
    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            participants: true,
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    console.log(
      `[TicketController] 🕒 DB tickets fetch took ${Date.now() - dbStart}ms (found ${tickets.length})`,
    );

    const mapStart = Date.now();
    const baseDtos = tickets.map((t) =>
      toTicketDTO(t as unknown as TicketWithRelations),
    );
    console.log(
      `[TicketController] 🕒 Mapping to DTO took ${Date.now() - mapStart}ms`,
    );

    const enrichStart = Date.now();
    let finalTickets = baseDtos;

    // 🛡️ CIRCUIT BREAKER: Prevent hanging request if enrichment fails (e.g. Redis timeout)
    try {
      const enrichmentPromise = enrichWithCrmData(baseDtos, companyId);
      const timeoutPromise = new Promise<TicketDTO[]>((_, reject) =>
        setTimeout(
          () => reject(new Error("Enrichment timed out (>2000ms)")),
          2000,
        ),
      );

      finalTickets = await Promise.race([enrichmentPromise, timeoutPromise]);
    } catch (enrichError) {
      console.error(
        `[TicketController] ⚠️ Enrichment skipped (returning base data): ${enrichError}`,
      );
      // Fallback: finalTickets remains baseDtos, so user sees tickets immediately
    }
    console.log(
      `[TicketController] 🕒 Enrichment took ${Date.now() - enrichStart}ms`,
    );

    console.log(
      `[TicketController] ✅ Total getAllTickets took ${Date.now() - startTime}ms`,
    );

    res.status(200).json({
      status: "success",
      results: finalTickets.length,
      data: { tickets: finalTickets },
    });
  },
);

/**
 * GET TICKET BY ID
 */
export const getTicketById = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            participants: true,
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!ticket) {
      return next(new AppError("Ticket not found", 404));
    }

    // Security check
    if (companyId && ticket.companyId !== companyId) {
      return next(
        new AppError("You do not have permission to view this ticket", 403),
      );
    }

    // 🛡️ 100-YEAR FIX: Agent Isolation
    // Agents can only view:
    // 1. Their own tickets (assignedToId === user.id)
    // 2. Unassigned tickets (assignedToId === null) - from Queue
    if (req.user?.role === "AGENT") {
      const isMine = ticket.assignedToId === req.user.id;
      const isUnassigned = !ticket.assignedToId;

      if (!isMine && !isUnassigned) {
        return next(
          new AppError(
            "Access restricted to assigned or queue tickets only",
            403,
          ),
        );
      }
    }
    // Access granted

    // 1. Initial Mapping
    const baseDto = toTicketDTO(ticket as unknown as TicketWithRelations);

    // 2. Enrich with CRM Data
    // Note: If companyId is missing (unlikely due to auth middleware), enrichment is skipped safely
    const [finalTicket] = companyId
      ? await enrichWithCrmData([baseDto], companyId)
      : [baseDto];

    res.status(200).json({
      status: "success",
      data: { ticket: finalTicket },
    });
  },
);

/**
 * UPDATE TICKET
 */
export const updateTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;
    const data = req.body;

    // First check existence and permission
    console.info(`[TicketController] 🛠️ Update Request for ID: '${id}'`); // Info level

    let targetId = id;
    let existingTicket = await prisma.ticket.findUnique({
      where: { id: targetId },
    });

    // 🛡️ 100-YEAR FIX: Smart ID Resolution
    // If ticket not found by ID, try finding it by Conversation ID.
    // This handles cases where frontend sends conversationId optimistically.
    if (!existingTicket && companyId) {
      const ticketByConv = await prisma.ticket.findFirst({
        where: { conversationId: targetId, companyId },
      });

      if (ticketByConv) {
        existingTicket = ticketByConv;
        targetId = ticketByConv.id;
        console.info(
          `[TicketController] 🔄 Resolved Ticket ${targetId} via Conversation ID ${id}`,
        );
      }
    }

    if (!existingTicket) {
      console.error(
        `[TicketController] ❌ Ticket NOT FOUND in DB for ID: '${id}'`,
      );
      return next(new AppError("Ticket not found", 404));
    }
    console.info(
      `[TicketController] ✅ Found ticket: ${existingTicket.id} (Company: ${existingTicket.companyId})`,
    );

    if (companyId && existingTicket.companyId !== companyId) {
      return next(new AppError("Permission denied", 403));
    }

    // Handle status change logic (e.g. resolvedAt)
    if (data.status === "RESOLVED" || data.status === "CLOSED") {
      if (
        existingTicket.status !== "RESOLVED" &&
        existingTicket.status !== "CLOSED"
      ) {
        data.resolvedAt = new Date();
      }
    }

    // Filter allowed fields to prevent Prisma errors with unknown arguments
    // 🛡️ 100-YEAR FIX: Strict Typing for Updates
    // We strictly map only allowed fields to prevent arbitrary data injection
    const updateData: Prisma.TicketUpdateInput = {};

    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (
      data.priority !== undefined &&
      Object.values(TicketPriority).includes(data.priority)
    ) {
      updateData.priority = data.priority;
    }
    if (
      data.status !== undefined &&
      Object.values(TicketStatus).includes(data.status)
    ) {
      updateData.status = data.status;
    }
    if (data.queueId !== undefined) {
      updateData.queue = data.queueId
        ? { connect: { id: data.queueId } }
        : { disconnect: true };
    }
    if (data.assignedToId !== undefined) {
      updateData.assignedTo = data.assignedToId
        ? { connect: { id: data.assignedToId } }
        : { disconnect: true };

      // 🛡️ 100-YEAR FIX: Auto-update Status on Assignment
      // - Assigning -> IN_PROGRESS (User takes the ticket)
      // - Unassigning -> OPEN (Back to queue)
      // Only apply if 'status' wasn't explicitly provided in the payload.
      if (data.status === undefined) {
        updateData.status = data.assignedToId ? "IN_PROGRESS" : "OPEN";
      }
    }
    if (data.resolvedAt !== undefined) updateData.resolvedAt = data.resolvedAt;
    if (data.resolutionType !== undefined)
      updateData.resolutionType = data.resolutionType;
    if (data.resolutionNotes !== undefined)
      updateData.resolutionNotes = data.resolutionNotes;

    // (Handled above in strict mapping)
    // if (updateData.assignedToId === null) { ... } logic is now obsolete due to above block

    let updatedTicket;
    try {
      updatedTicket = await prisma.ticket.update({
        where: { id: targetId },
        data: updateData,
        include: {
          createdBy: true,
          assignedTo: true,
          queue: true,
          conversation: {
            include: {
              participants: true,
              messages: {
                take: 1,
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      });
    } catch (error: unknown) {
      console.error("[TicketController] Prisma Update Failed:", error);
      // Check for Foreign Key constraint violation (e.g. invalid queueId)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        return next(new AppError("Invalid Queue ID or User ID", 400));
      }
      throw error;
    }

    // Auto-assignment trigger if moved to a queue and unassigned
    if (data.queueId && updatedTicket.queueId && !updatedTicket.assignedToId) {
      try {
        const { assignTicketToAgent } =
          await import("@/services/autoAssignmentService");
        await assignTicketToAgent(updatedTicket.id, updatedTicket.queueId);
      } catch (error) {
        console.error("Auto-assignment failed:", error);
      }
    }

    // 🔥 CRITICAL: Sync Conversation Queue & Assignment
    // The Chat System relies on Conversation model, not Ticket model.
    // If we don't sync assignedToId, the agent won't receive message socket events.
    if (updatedTicket.conversationId) {
      const syncData: Prisma.ConversationUpdateInput = {};
      let needsSync = false;

      if (data.queueId !== undefined) {
        syncData.queue = data.queueId
          ? { connect: { id: data.queueId } }
          : { disconnect: true };
        needsSync = true;
      }

      if (data.assignedToId !== undefined) {
        syncData.assignedTo = data.assignedToId
          ? { connect: { id: data.assignedToId } }
          : { disconnect: true };
        needsSync = true;
      }

      if (data.status !== undefined) {
        // Enforce type compatibility since Enums match exactly
        syncData.status = data.status as unknown as
          | "OPEN"
          | "IN_PROGRESS"
          | "RESOLVED"
          | "CLOSED";
        needsSync = true;

        if (data.status === "RESOLVED" || data.status === "CLOSED") {
          syncData.resolvedAt = new Date();
        }
      }

      if (needsSync) {
        try {
          await prisma.conversation.update({
            where: { id: updatedTicket.conversationId },
            data: syncData,
          });
          console.info(
            `[TicketController] ✅ Synced Conversation Status/Queue/Assignee for Ticket ${updatedTicket.id}`,
          );
        } catch (error) {
          console.error(
            "[TicketController] Failed to sync conversation:",
            error,
          );
        }
      }
    }

    // 🚀 ENTERPRISE: Real-time notifications for ticket updates
    const ticketDto = toTicketDTO(
      updatedTicket as unknown as TicketWithRelations,
    );

    try {
      const io = gateway.getIO();
      const previousAssignee = existingTicket.assignedToId;
      const newAssignee = updatedTicket.assignedToId;
      const assigneeChanged =
        previousAssignee !== newAssignee && newAssignee !== null;

      // 1️⃣ BROADCAST: Notify entire company about ticket update (for list refreshes)
      io.to(`company:${updatedTicket.companyId}`).emit("ticket.updated", {
        ticket: ticketDto,
        changedFields: Object.keys(updateData),
      });

      // 1.5 DIRECT UPDATE (100-Year Fix): Notify ALL affected agents (Current & Previous)
      // Agents are NOT in the company room.
      // - New Assignee needs to see the update (or assignment).
      // - Old Assignee needs to see the update (so it disappears from their list).
      const affectedAgents = new Set<string>();
      if (updatedTicket.assignedToId)
        affectedAgents.add(updatedTicket.assignedToId);
      if (previousAssignee) affectedAgents.add(previousAssignee);

      affectedAgents.forEach((agentId) => {
        io.to(`agent:${agentId}`).emit("ticket.updated", {
          ticket: ticketDto,
          changedFields: Object.keys(updateData),
        });
      });

      // 2️⃣ DIRECT NOTIFICATION: If ticket was assigned to someone new (Sound + Toast)
      if (assigneeChanged && newAssignee) {
        // Emit to agent's personal room (Canonical room is `agent:${id}`)
        io.to(`agent:${newAssignee}`).emit("ticket.assigned", {
          ticket: ticketDto,
          message: `Se te ha asignado el ticket #${updatedTicket.ticketNumber}: ${updatedTicket.subject}`,
          assignedBy: req.user?.name || "Sistema",
          timestamp: new Date().toISOString(),
        });

        // 3️⃣ PERSISTENT NOTIFICATION: Create in-app notification record
        try {
          await prisma.notification.create({
            data: {
              companyId: updatedTicket.companyId,
              userId: newAssignee,
              type: "TICKET_ASSIGNED",
              title: `Ticket #${updatedTicket.ticketNumber} asignado`,
              message: `Se te ha asignado: ${updatedTicket.subject}`,
              link: `/tickets/${updatedTicket.id}`,
              metadata: {
                ticketId: updatedTicket.id,
                ticketNumber: updatedTicket.ticketNumber,
                conversationId: updatedTicket.conversationId,
                assignedBy: req.user?.id,
              },
              read: false,
            },
          });
        } catch (notifError) {
          // Non-blocking: Log but don't fail the request
          console.error(
            "[TicketController] Failed to create notification:",
            notifError,
          );
        }
      }

      // 4️⃣ CONVERSATION SYNC: Also emit conversation.updated for chat panels
      if (updatedTicket.conversationId) {
        io.to(`company:${updatedTicket.companyId}`).emit(
          "conversation.updated",
          {
            id: updatedTicket.conversationId,
            ticketId: updatedTicket.id,
            queueId: updatedTicket.queueId,
            assignedToId: updatedTicket.assignedToId,
            contact: {
              queueName: updatedTicket.queue?.name,
              assignedAgentName: updatedTicket.assignedTo?.name,
              assignedAgentId: updatedTicket.assignedToId,
            },
          },
        );
      }
    } catch (e) {
      console.error("[TicketController] Socket emit failed:", e);
    }

    res.status(200).json({
      status: "success",
      data: {
        ticket: toTicketDTO(updatedTicket as unknown as TicketWithRelations),
      },
    });
  },
);

/**
 * DELETE TICKET
 */
export const deleteTicket = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return next(new AppError("Ticket not found", 404));
    }
    if (companyId && ticket.companyId !== companyId) {
      return next(new AppError("Permission denied", 403));
    }

    await prisma.ticket.delete({ where: { id } });

    // 🚀 EMIT EVENT
    try {
      if (companyId) {
        gateway.emitToCompany(companyId, "ticket.deleted", { ticketId: id });
      }
    } catch (e) {
      console.error("[TicketController] Socket emit failed:", e);
    }

    res.status(204).send();
  },
);
