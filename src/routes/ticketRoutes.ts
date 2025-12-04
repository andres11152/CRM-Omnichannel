import express from "express";
import { prisma } from "@/config/prisma";

const router = express.Router();

// GET all tickets (maps conversations to tickets for frontend compatibility)
router.route("/").get(async (req: any, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res
        .status(400)
        .json({ message: "Company ID missing from request" });
    }

    const conversations = await prisma.conversation.findMany({
      where: { companyId },
      include: {
        participants: true,
        queue: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const tickets = conversations.map((conv) => {
      const contact =
        conv.participants.find((p) => p.role === "USER") ||
        conv.participants[0];
      const lastMsg = conv.messages[0];

      return {
        id: conv.id,
        companyId: conv.companyId,
        status: conv.status,
        conversationId: conv.id,
        contact: {
          id: contact?.id || "",
          name: contact?.name || "Unknown",
          email: contact?.email || "",
          companyId: conv.companyId,
          avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(
            contact?.name || "U"
          )}&background=random`,
          lastMessage: lastMsg?.content || "No messages",
          lastMessageTime: lastMsg?.createdAt || conv.updatedAt,
          unreadCount: 0,
          tags: [],
          channel: "WhatsApp",
          assignedMode: "human",
          status: conv.status,
        },
        channel: "WhatsApp",
        lastMessage: lastMsg?.content || "No messages",
        lastMessageAt: lastMsg?.createdAt || conv.updatedAt,
        unreadCount: 0,
        tags: [],
        queueId: conv.queueId,
        queue: conv.queue ? { id: conv.queue.id, name: conv.queue.name } : null,
        assignedAgentId: conv.assignedToId,
        createdAt: conv.createdAt,
      };
    });

    res.status(200).json({
      status: "success",
      results: tickets.length,
      data: { tickets },
    });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch tickets", error: String(error) });
  }
});

// PATCH update ticket status
router.route("/:id").patch(async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status, assignedToId, queueId } = req.body;

    console.log(`[PATCH Ticket] ID: ${id}, Body:`, req.body);

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (assignedToId !== undefined) data.assignedToId = assignedToId;
    if (queueId !== undefined) {
      if (queueId) {
        const queueExists = await prisma.queue.findUnique({
          where: { id: queueId },
        });
        if (!queueExists) {
          return res
            .status(400)
            .json({ message: `Queue with ID ${queueId} not found` });
        }
      }
      data.queueId = queueId;
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data,
    });

    res.status(200).json({
      status: "success",
      data: { ticket: updated },
    });
  } catch (error) {
    console.error("Error updating ticket:", error);
    res
      .status(500)
      .json({ message: "Failed to update ticket", error: String(error) });
  }
});

// Placeholder routes for other methods
router
  .route("/")
  .post((req, res) =>
    res.status(501).json({ message: "POST /tickets not implemented" })
  );
router
  .route("/:id")
  .get((req, res) =>
    res.status(501).json({ message: "GET /tickets/:id not implemented" })
  );
// DELETE ticket (only for ADMIN users)
router.route("/:id").delete(async (req: any, res) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;
    const userRole = req.user?.role;

    // Only ADMIN users can delete tickets
    if (userRole !== "ADMIN") {
      return res.status(403).json({
        message: "Solo administradores pueden eliminar tickets",
      });
    }

    // Verify conversation belongs to user's company
    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return res.status(404).json({ message: "Ticket no encontrado" });
    }

    if (conversation.companyId !== companyId) {
      return res.status(403).json({
        message: "No tienes permiso para eliminar este ticket",
      });
    }

    // Delete associated messages first (cascade delete)
    await prisma.message.deleteMany({
      where: { conversationId: id },
    });

    // Delete the conversation
    await prisma.conversation.delete({
      where: { id },
    });

    res.status(200).json({
      status: "success",
      message: "Ticket eliminado correctamente",
    });
  } catch (error) {
    console.error("Error deleting ticket:", error);
    res.status(500).json({ message: "Error al eliminar ticket" });
  }
});

export default router;
