import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { prisma } from "@/config/prisma";
import { AuthenticatedRequest } from "@/types/types";
import { gateway } from "@/gateways/socketGateway";

// --- HELPERS ---

// Map Prisma Ticket to Frontend Ticket (with Contact)
const mapTicketToFrontend = (ticket: any) => {
  // Extract phone from email with BROAD heuristics
  let derivedPhone = ticket.createdBy?.phone;

  // 1. Try Email Parsing (Aggressive)
  if (!derivedPhone && ticket.createdBy?.email) {
    const match = ticket.createdBy.email.match(/\d{7,15}/);
    if (match) {
      derivedPhone = match[0];
    }
  }

  // 2. Try Description (Aggressive)
  if (!derivedPhone && ticket.description) {
    const match = ticket.description.match(/\d{7,15}/);
    if (match) {
      derivedPhone = match[0];
      // Keep this specific log as it indicates data repair
      console.log(
        `[TicketController] 🔧 Salvaged phone ${derivedPhone} from description`
      );
    }
  }

  // 3. Try Subject (Existing but broadened)
  if (!derivedPhone && ticket.subject) {
    const match = ticket.subject.match(/\d{7,15}/);
    if (match) {
      derivedPhone = match[0];
      console.log(
        `[TicketController] 🔧 Salvaged phone ${derivedPhone} from subject`
      );
    }
  }

  // 🔥 CRITICAL: Sanitize name - NEVER return "Unknown"
  let displayName = ticket.createdBy?.name || "";

  // Normalize checking
  const checkName = displayName.toLowerCase();
  const isInvalidName =
    !displayName ||
    checkName.includes("unknown") ||
    checkName.includes("sin nombre") ||
    displayName.trim() === "";

  if (isInvalidName) {
    // Use phone as fallback
    displayName = derivedPhone || "Usuario WhatsApp";
  }

  // Determine Fallback Phone for missing user cases
  let fallbackPhone = ticket.conversation?.channelId || "";

  if (!fallbackPhone && ticket.description) {
    const match = ticket.description.match(/\d{7,15}/);
    if (match) fallbackPhone = match[0];
  }
  if (!fallbackPhone && ticket.subject) {
    const match = ticket.subject.match(/\d{7,15}/);
    if (match) fallbackPhone = match[0];
  }

  // Get real last message if available
  const lastMsg = ticket.conversation?.messages?.[0];
  const lastMessageContent = lastMsg?.content || "";
  const lastMessageTime = lastMsg?.createdAt || ticket.createdAt; // Fallback to ticket creation

  return {
    ...ticket,
    contact: ticket.createdBy
      ? {
          id: ticket.createdBy.id,
          name: displayName,
          email: ticket.createdBy.email,
          phone: derivedPhone || ticket.conversation?.channelId,
          channelId:
            ticket.createdBy.channelId ||
            derivedPhone ||
            ticket.conversation?.channelId,
          companyId: ticket.companyId,
          avatarUrl:
            ticket.createdBy.profilePicUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              displayName
            )}`,
          profilePicUrl: ticket.createdBy.profilePicUrl,
          about: ticket.createdBy.about,
          lastMessage: lastMessageContent,
          lastMessageTime: lastMessageTime,
          unreadCount: 0, // Pending: Implement real unread count logic
          tags: ticket.conversation?.tags || [],
          channel: "WhatsApp",
          assignedMode: "human",
          status: ticket.status,
        }
      : {
          // Fallback if createdBy is null - WITH HEURISTICS
          id: "missing-user",
          name:
            displayName !== "Usuario WhatsApp" && displayName !== ""
              ? displayName
              : fallbackPhone || "Usuario WhatsApp",
          email: "",
          phone: fallbackPhone,
          channelId: fallbackPhone,
          companyId: ticket.companyId,
          avatarUrl: "",
          lastMessage: lastMessageContent,
          lastMessageTime: lastMessageTime,
          unreadCount: 0,
          tags: [],
          channel: "WhatsApp" as any,
          assignedMode: "human" as any,
          status: ticket.status,
        },
    conversationId: ticket.conversationId,
    lastMessage: lastMessageContent,
    lastMessageAt: lastMessageTime,
  };
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
        conversation: true,
      },
    });

    // Auto-assignment trigger
    if (newTicket.queueId && !newTicket.assignedToId) {
      // We can run this in background or await it.
      // For responsiveness, let's await it but catch errors so we don't fail the request.
      try {
        const { assignTicketToAgent } = await import(
          "@/services/autoAssignmentService"
        );
        await assignTicketToAgent(newTicket.id, newTicket.queueId);
        // We might want to re-fetch the ticket to return the assigned agent
        // But for now, returning the initial state is fine, frontend will see update via socket or refresh.
      } catch (error) {
        console.error("Auto-assignment failed:", error);
      }
    }

    res.status(201).json({
      status: "success",
      data: { ticket: mapTicketToFrontend(newTicket) },
    });
  }
);

/**
 * GET ALL TICKETS
 */
export const getAllTickets = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;
    const { status, priority, queueId, assignedToId } = req.query;

    if (!companyId) {
      return res
        .status(200)
        .json({ status: "success", results: 0, data: { tickets: [] } });
    }

    const where: any = { companyId };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (queueId) where.queueId = queueId;
    if (assignedToId) where.assignedToId = assignedToId;

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        createdBy: true,
        assignedTo: true,
        queue: true,
        conversation: {
          include: {
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 1. Initial Mapping (Derives Phones)
    const baseMappedTickets = tickets.map(mapTicketToFrontend);

    // 2. Collect Phones to fetch CRM Data
    const phonesToFetch = new Set<string>();
    baseMappedTickets.forEach((t) => {
      if (t.contact.phone) phonesToFetch.add(t.contact.phone);
    });

    let crmContactMap = new Map<string, string>();
    if (phonesToFetch.size > 0) {
      const contacts = await prisma.contact.findMany({
        where: {
          companyId,
          phone: { in: Array.from(phonesToFetch) },
        },
        select: { id: true, phone: true },
      });
      contacts.forEach((c) => {
        if (c.phone) crmContactMap.set(c.phone, c.id);
      });
    }

    // 3. Enrich with realContactId
    const finalTickets = baseMappedTickets.map((t) => ({
      ...t,
      contact: {
        ...t.contact,
        realContactId: t.contact.phone
          ? crmContactMap.get(t.contact.phone)
          : undefined,
      },
    }));

    res.status(200).json({
      status: "success",
      results: tickets.length,
      data: { tickets: finalTickets },
    });
  }
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
        new AppError("You do not have permission to view this ticket", 403)
      );
    }

    // 1. Initial Mapping
    const mappedTicket = mapTicketToFrontend(ticket);

    // 2. Fetch CRM Contact Info
    let realContactId: string | undefined = undefined;
    if (mappedTicket.contact.phone && companyId) {
      const crmContact = await prisma.contact.findFirst({
        where: {
          companyId,
          phone: mappedTicket.contact.phone,
        },
        select: { id: true },
      });
      if (crmContact) realContactId = crmContact.id;
    }

    // 3. Enrich
    const finalTicket = {
      ...mappedTicket,
      contact: {
        ...mappedTicket.contact,
        realContactId,
      },
    };

    res.status(200).json({
      status: "success",
      data: { ticket: finalTicket },
    });
  }
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
    const existingTicket = await prisma.ticket.findUnique({ where: { id } });
    if (!existingTicket) {
      return next(new AppError("Ticket not found", 404));
    }
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
    const allowedFields = [
      "subject",
      "description",
      "priority",
      "status",
      "queueId",
      "assignedToId",
      "resolvedAt",
      "resolutionType",
      "resolutionNotes",
    ];
    const updateData: any = {};

    Object.keys(data).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateData[key] = data[key];
      }
    });

    // Handle explicit null for assignedToId (unassign)
    if (updateData.assignedToId === null) {
      delete updateData.assignedToId;
      updateData.assignedTo = { disconnect: true };
    }

    console.log("[TicketController] Updating ticket ID:", id);
    console.log("[TicketController] Raw Data:", JSON.stringify(data));
    console.log(
      "[TicketController] Filtered Update Data:",
      JSON.stringify(updateData)
    );

    let updatedTicket;
    try {
      updatedTicket = await prisma.ticket.update({
        where: { id },
        data: updateData,
        include: {
          createdBy: true,
          assignedTo: true,
          queue: true,
          conversation: {
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      });
    } catch (error: any) {
      console.error("[TicketController] Prisma Update Failed:", error);
      // Check for Foreign Key constraint violation (e.g. invalid queueId)
      if (error.code === "P2003") {
        return next(new AppError("Invalid Queue ID or User ID", 400));
      }
      throw error;
    }

    // Auto-assignment trigger if moved to a queue and unassigned
    if (data.queueId && updatedTicket.queueId && !updatedTicket.assignedToId) {
      try {
        const { assignTicketToAgent } = await import(
          "@/services/autoAssignmentService"
        );
        await assignTicketToAgent(updatedTicket.id, updatedTicket.queueId);
      } catch (error) {
        console.error("Auto-assignment failed:", error);
      }
    }

    // 🔥 CRITICAL: Si el ticket tiene conversación, sincronizar el queueId
    // Esto permite que el AI assistant responda cuando se transfiere un ticket
    if (updatedTicket.conversationId && updateData.queueId !== undefined) {
      try {
        await prisma.conversation.update({
          where: { id: updatedTicket.conversationId },
          data: { queueId: updateData.queueId },
        });
        console.log(
          `[TicketController] ✓ Synced conversation queueId: ${updateData.queueId}`
        );
      } catch (error) {
        console.error(
          "[TicketController] Failed to sync conversation queueId:",
          error
        );
      }
    }

    // 🚀 EMIT EVENT FOR FRONTEND UPDATE
    // This fixes the bug where the badge doesn't update immediately
    try {
      const io = gateway.getIO();
      const payload = {
        id: updatedTicket.conversationId, // Match frontend "conversation.updated" expectation
        ticketId: updatedTicket.id,
        contact: {
          queueName: updatedTicket.queue?.name,
          assignedAgentName: updatedTicket.assignedTo?.name,
          assignedAgentId: updatedTicket.assignedToId,
        },
      };

      if (updatedTicket.companyId) {
        io.to(`company:${updatedTicket.companyId}`).emit(
          "conversation.updated",
          payload
        );
      }
    } catch (e) {
      console.error("[TicketController] Socket emit failed:", e);
    }

    res.status(200).json({
      status: "success",
      data: { ticket: mapTicketToFrontend(updatedTicket) },
    });
  }
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

    res.status(204).send();
  }
);
