import { Request, Response } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { prisma } from "@/config/prisma";
import { AppError } from "@/utils/AppError";
import { HTTP_STATUS } from "@/constants/httpStatus";

export const contactController = {
  createContact: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { name, email, phone, avatarUrl, tags, notes, customFields } =
      req.body;

    if (!name) {
      throw new AppError("Name is required", HTTP_STATUS.BAD_REQUEST);
    }

    // Use raw query to avoid Prisma schema sync issues
    const id = `c-${Date.now()}`;
    const now = new Date().toISOString();

    // Simple raw insert for robustness
    await prisma.$executeRaw`
      INSERT INTO "contacts" ("id", "companyId", "name", "email", "phone", "avatarUrl", "tags", "notes", "customFields", "createdAt", "updatedAt")
      VALUES (${id}, ${companyId}, ${name}, ${email || null}, ${
      phone || null
    }, ${avatarUrl || null}, ${tags || []}, ${notes || null}, ${
      customFields ? JSON.stringify(customFields) : null
    }::jsonb, ${now}::timestamp, ${now}::timestamp)
    `;

    const newContact = {
      id,
      companyId,
      name,
      email,
      phone,
      avatarUrl,
      tags: tags || [],
      notes,
      customFields,
      createdAt: now,
      updatedAt: now,
    };

    res.status(HTTP_STATUS.CREATED).json(newContact);
  }),

  getContacts: catchAsync(async (req: Request, res: Response) => {
    const companyId = (req as any).companyId;

    console.log(
      "[ContactController] Fetching contacts for company:",
      companyId
    );

    // Raw query
    const contacts = await prisma.$queryRaw`
      SELECT * FROM "contacts" WHERE "companyId" = ${companyId} ORDER BY "createdAt" DESC
    `;

    console.log("[ContactController] Found contacts:", contacts);
    console.log(
      "[ContactController] Number of contacts:",
      Array.isArray(contacts) ? contacts.length : 0
    );

    res.status(HTTP_STATUS.OK).json(contacts);
  }),

  updateContact: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;
    const { name, email, phone, tags, notes } = req.body;

    const now = new Date().toISOString();

    await prisma.$executeRaw`
        UPDATE "contacts" 
        SET "name" = ${name}, "email" = ${email}, "phone" = ${phone}, "tags" = ${tags}, "notes" = ${notes}, "updatedAt" = ${now}::timestamp
        WHERE "id" = ${id} AND "companyId" = ${companyId}
    `;

    res.status(HTTP_STATUS.OK).json({ status: "success" });
  }),

  deleteContact: catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const companyId = (req as any).companyId;

    await prisma.$executeRaw`
        DELETE FROM "contacts" WHERE "id" = ${id} AND "companyId" = ${companyId}
    `;

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
        title: `${a.type}: ${a.subject}`,
        subtitle: a.description || "",
        icon: a.type === "CALL" ? "📞" : "📅",
        color: "yellow",
      })),
      ...tickets.map((t) => ({
        type: "TICKET",
        id: t.id,
        date: t.createdAt,
        title: `Ticket #${t.id.substring(0, 5)}: ${t.subject}`,
        subtitle: t.status,
        icon: "🎫",
        color: "red",
      })),
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
