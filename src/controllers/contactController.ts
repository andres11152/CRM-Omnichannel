import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";

export const contactController = {
  // Create or Update a contact based on ID, phone or email
  upsertContact: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    let { id, name, email, phone, avatarUrl, tags, notes, customFields } =
      req.body;

    // 1. CLEANUP & VALIDATION
    // Force clean tech emails
    if (
      email &&
      (email.includes("@whatsapp.user") || email.includes("@c.us"))
    ) {
      email = null;
    }
    // Treat empty as null
    if (email === "") email = null;
    if (phone === "") phone = null;

    if (!phone && !email && !id) {
      throw new AppError(
        "Phone, Email or ID is required",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Attempt to find existing contact
    let existingContact = null;

    // A. Try by ID (most reliable for edits)
    if (id) {
      existingContact = await prisma.contact.findFirst({
        where: { id, companyId },
      });
    }

    // B. Try by Phone/Email if no ID or ID not found
    if (!existingContact) {
      existingContact = await prisma.contact.findFirst({
        where: {
          companyId,
          OR: [phone ? { phone } : {}, email ? { email } : {}].filter(
            (c) => Object.keys(c).length > 0
          ),
        },
      });
    }

    let contact;
    if (existingContact) {
      // Update existing
      contact = await prisma.contact.update({
        where: { id: existingContact.id },
        data: {
          name: name || undefined,
          // Explicitly allow null to clear bad emails
          email: email,
          phone: phone || undefined,
          tags: tags || undefined,
          notes: notes || undefined,
          customFields: customFields || undefined,
          avatarUrl: avatarUrl || undefined,
        },
      });
    } else {
      // Create new
      contact = await prisma.contact.create({
        data: {
          companyId,
          name: name || "New Contact",
          email, // Can be null
          phone,
          tags: tags || [],
          notes,
          customFields: customFields || {},
          avatarUrl,
        },
      });
    }

    const updatedContact = contact;

    // 🔴 SYNC: Update the corresponding User (WhatsApp User) if it exists
    // This bridges the gap between CRM Contacts and Ticket Users
    if (phone) {
      try {
        const cleanPhone = phone.replace(/\D/g, ""); // Remove + or spaces
        if (cleanPhone.length > 5) {
            // Find users with this phone
             const users = await prisma.user.findMany({
                 where: {
                     phone: { contains: cleanPhone },
                     role: { not: 'ADMIN' }, // Don't rename Admins accidentally
                     OR: [
                         { role: 'CUSTOMER' },
                         { role: 'USER' } // Depending on schema defaults
                     ]
                 }
             });
             
             for (const user of users) {
                 await prisma.user.update({
                     where: { id: user.id },
                     data: { name: name || user.name }
                 });
                 console.log(`[ContactController] 🔄 Synced name "${name}" to User ${user.id}`);
             }
        }
      } catch (err) {
          console.error("[ContactController] Failed to sync User name:", err);
      }
    }

    res.status(HTTP_STATUS.OK).json(contact);
  }),

  getContacts: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { search } = req.query;

    const where: any = { companyId };
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: "insensitive" } },
        { phone: { contains: String(search) } },
        { email: { contains: String(search), mode: "insensitive" } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.status(HTTP_STATUS.OK).json(contacts);
  }),

  // Get specific contact by ID or Phone (for chat integration)
  getContactDetail: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { id, phone } = req.query;

    if (!id && !phone) throw new AppError("ID or Phone required", 400);

    let contact;
    if (id) {
      contact = await prisma.contact.findFirst({
        where: { id: String(id), companyId },
      });
    } else if (phone) {
      contact = await prisma.contact.findFirst({
        where: { phone: String(phone), companyId },
      });
    }

    if (!contact) {
      // Return empty/null instead of error to allow frontend to show "Create Contact" form
      return res.status(200).json(null);
    }

    res.status(HTTP_STATUS.OK).json(contact);
  }),

  deleteContact: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;

    // 1. Unlink Deals (preserve the deal, just remove contact association)
    await prisma.deal.updateMany({
      where: { contactId: id, companyId },
      data: { contactId: null },
    });

    // 2. Unlink Activities (preserve activity, history remains)
    await prisma.activity.updateMany({
      where: { contactId: id, companyId },
      data: { contactId: null },
    });

    // 3. Delete Contact
    const result = await prisma.contact.deleteMany({
      where: { id, companyId },
    });

    if (result.count === 0) {
      throw new AppError(
        "Contact not found or already deleted",
        HTTP_STATUS.NOT_FOUND
      );
    }

    res.status(HTTP_STATUS.OK).json({ status: "success" });
  }),

  getContactTimeline: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;

    // 1. Fetch Contact
    const contact: any = await prisma.$queryRaw`
        SELECT * FROM "contacts" WHERE "id" = ${id} AND "companyId" = ${companyId} LIMIT 1
    `;

    if (!contact || contact.length === 0) {
      throw new AppError("Contact not found", HTTP_STATUS.NOT_FOUND);
    }
    const targetContact = contact[0];

    // 2. Fetch Related Data concurrently
    // Strategy:
    // - Deals & Activities linked directly by contactId (if schema supported it perfectly, but schema seems to rely on Relation Fields).
    //   Wait, schema has `deals Deal[]` and `activities Activity[]` on Contact model.
    // - Chats linked by Phone (Soft Link).

    // Since we are using raw queries for Contact, let's try standard Prisma for the rest if possible,
    // BUT if the schema is out of sync (as suggested by "Use raw query" comments), we might need to be careful.
    // However, the schema file I saw earlier seemed to have the relations. Let's try standard Prisma for relations where possible,
    // or fallback to findMany.

    // A. Deals (Direct link)
    const deals = await prisma.deal.findMany({
      where: { contactId: id, companyId },
      orderBy: { createdAt: "desc" },
    });

    // B. Activities (Direct link)
    const activities = await prisma.activity.findMany({
      where: { contactId: id, companyId },
      orderBy: { createdAt: "desc" },
      include: { createdBy: true },
    });

    // C. Tickets (Soft Link via Conversation -> Phone OR Direct if we added it? Schema generally links Ticket to Conversation)
    // D. Conversations (Soft Link via Phone)
    let conversations: any[] = [];
    let tickets: any[] = [];

    if (targetContact.phone) {
      // Find conversations where channelId contains the phone number (fuzzy match or exact)
      // Usually WhatsApp IDs are like "1234567890@s.whatsapp.net"
      // Let's assume strict contains or exact match logic isn't perfect, but "contains" is safer for now.
      // Cleaning phone number:
      const cleanPhone = targetContact.phone.replace(/\D/g, "");

      if (cleanPhone.length > 5) {
        conversations = await prisma.conversation.findMany({
          where: {
            companyId,
            channelId: { contains: cleanPhone },
          },
          include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
        });

        // Get IDs for fetching tickets
        const conversationIds = conversations.map((c) => c.id);

        if (conversationIds.length > 0) {
          tickets = await prisma.ticket.findMany({
            where: {
              companyId,
              conversationId: { in: conversationIds },
            },
            orderBy: { createdAt: "desc" },
          });
        }
      }
    }

    // 3. Merge and Sort
    const timeline = [
      ...deals.map((d) => ({
        type: "DEAL",
        id: d.id,
        date: d.createdAt,
        title: `Oportunidad: ${d.title}`,
        subtitle: `${d.value} ${d.currency} - ${d.stage}`,
        icon: "💰",
        color: "green",
      })),
      ...activities.map((a) => ({
        type: "ACTIVITY",
        id: a.id,
        date: a.createdAt,
        title: `${
          a.type === "CALL"
            ? "Llamada"
            : a.type === "MEETING"
            ? "Reunión"
            : "Tarea"
        }: ${a.subject}`,
        subtitle: a.description || "",
        icon: a.type === "CALL" ? "📞" : "📅",
        color: "yellow",
      })),
      ...tickets.map((t) => {
        const statusText =
          t.status === "OPEN"
            ? "Abierto"
            : t.status === "RESOLVED"
            ? "Resuelto"
            : t.status === "CLOSED"
            ? "Cerrado"
            : t.status;
        return {
          type: "TICKET",
          id: t.id,
          date: t.createdAt,
          title: `Ticket #${t.ticketNumber}: ${t.subject}`,
          subtitle: statusText,
          icon: "🎫",
          color: "red",
        };
      }),
      ...conversations.map((c) => ({
        type: "CONVERSATION",
        id: c.id,
        date: c.updatedAt, // Use updated at to show recent activity
        title: `Chat en ${c.channelId}`,
        subtitle: c.messages[0]?.content || "(Sin mensajes)",
        icon: "💬",
        color: "blue",
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.status(HTTP_STATUS.OK).json({
      contact: targetContact,
      timeline,
    });
  }),
};
