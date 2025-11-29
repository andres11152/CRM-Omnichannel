import express from "express";
import { prisma } from "@/config/prisma";
// Asumimos que tienes un ticketController con estas funciones.
// Si no existe, habría que crearlo.
// import {
//   getAllTickets,
//   createTicket,
//   getTicket,
//   updateTicket,
//   deleteTicket,
// } from '@/controllers/ticketController';

const router = express.Router();

// Estas rutas son solo un ejemplo. Deberían apuntar a funciones reales del controlador.

// ...

router.route("/").get(async (req, res) => {
  try {
    // Fetch conversations with participants and latest message
    const conversations = await prisma.conversation.findMany({
      include: {
        participants: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Map to Ticket format
    const tickets = conversations.map((conv) => {
      // Find the contact (not the agent/admin)
      // For now, just pick the first participant that is a USER
      const contact =
        conv.participants.find((p) => p.role === "USER") ||
        conv.participants[0];
      const lastMsg = conv.messages[0];

      return {
        id: conv.id,
        contact: {
          name: contact?.name || "Unknown",
          avatarUrl: `https://ui-avatars.com/api/?name=${
            contact?.name || "U"
          }&background=random`,
        },
        channel: "WhatsApp",
        status: conv.status.toLowerCase() === "open" ? "open" : "closed", // Simple mapping
        lastMessage: lastMsg?.content || "No messages",
        lastMessageTime: (lastMsg?.createdAt || conv.updatedAt).toISOString(),
        tags: ["Support"], // Default tag
        queueId: null, // TODO: Implement queues
        createdAt: conv.createdAt.toISOString(),
      };
    });

    res.status(200).json(tickets);
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ message: "Failed to fetch tickets" });
  }
});
router
  .route("/")
  .post((req, res) =>
    res.status(200).json({ message: "POST /tickets not implemented" })
  );
router
  .route("/:id")
  .get((req, res) =>
    res.status(200).json({ message: "GET /tickets/:id not implemented" })
  );
router
  .route("/:id")
  .patch((req, res) =>
    res.status(200).json({ message: "PATCH /tickets/:id not implemented" })
  );
router
  .route("/:id")
  .delete((req, res) =>
    res.status(200).json({ message: "DELETE /tickets/:id not implemented" })
  );

export default router;
