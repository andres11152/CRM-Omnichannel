import { prisma } from "@/config/prisma";
import { gateway } from "@/gateways/socketGateway";
import bcrypt from "bcryptjs";

interface IncomingMessagePayload {
  companyId: string;
  sessionId: string; // channelId
  remoteJid: string; // Phone number
  text: string;
  isOutbound: boolean;
  contactName?: string;
  senderName?: string; // For outbound agents
  hasMedia?: boolean;
  media?: {
    url: string;
    type: string; // "image", "video", "document", "audio"
    mimetype?: string;
    caption?: string;
  };
}

/**
 * MESSAGE PROCESSOR SERVICE
 * Centralizes logic for processing incoming messages from ANY source
 * (Baileys, WhatsApp Cloud API, External Webhooks)
 */

// Lock to prevent creating multiple conversations for same number simultaneously
const conversationLocks = new Map<string, Promise<any>>();

// Helper to aggressively normalize JID to a clean phone number
const getRealNumber = (jid: string | null | undefined): string | null => {
  if (!jid) return null;

  // 1. Basic String Cleaning (Remove suffixes like @s.whatsapp.net or @lid)
  let clean = jid.toString().split("@")[0];

  // 2. Remove ANY non-digit character to get pure numbers
  clean = clean.replace(/\D/g, "");

  console.log(
    `[MessageProcessor] normalizePhone: Input="${jid}" -> Processed="${clean}"`
  );

  // 3. GRACEFUL SKIP for known Ghost/LID numbers
  // 459... and 252... are known technical prefixes for LIDs.
  if (clean.length > 15 || clean.startsWith("459") || clean.startsWith("252")) {
    console.log(
      `[MessageProcessor] 👻 Skipping internal LID/System message: ${clean}`
    );
    return null;
  }

  // 4. Strict Check for too short (invalid numbers)
  if (clean.length < 7) {
    console.warn(
      `[MessageProcessor] ⚠️ Skipping invalid/short phone. Cleaned: "${clean}"`
    );
    return null;
  }

  return clean;
};

export const messageProcessor = {
  async process(payload: IncomingMessagePayload) {
    const { companyId, remoteJid } = payload;

    // ✅ JID NORMALIZATION
    const phone = getRealNumber(remoteJid);
    if (!phone) {
      // Gracefully skip internal messages without error
      return;
    }

    // Create a lock key to prevent race conditions
    const lockKey = `${companyId}-${phone}`;

    // If there's already a process running for this phone, wait for it
    if (conversationLocks.has(lockKey)) {
      await conversationLocks.get(lockKey);
    }

    // Create a new lock promise
    // Pass the NORMALIZED phone as remoteJid to the internal processor
    const lockPromise = this._processMessage({ ...payload, remoteJid: phone });
    conversationLocks.set(lockKey, lockPromise);

    try {
      return await lockPromise;
    } catch (error) {
      console.error("[MessageProcessor] ❌ Error in process execution:", error);
    } finally {
      // Release lock after 2 seconds to allow subsequent messages
      setTimeout(() => conversationLocks.delete(lockKey), 2000);
    }
  },

  async _processMessage(payload: IncomingMessagePayload) {
    try {
      const {
        companyId,
        remoteJid: phone, // Already normalized in process()
        text,
        isOutbound,
        contactName, // This comes from msg.pushName
        senderName,
        hasMedia,
        media,
      } = payload;

      console.log(
        `🔍 [MessageProcessor] Message from ${phone} (${
          isOutbound ? "OUT" : "IN"
        })`
      );

      // 🔥 SANITIZE ContactName (Never trust "Unknown" from WhatsApp)
      const sanitizedContactName =
        contactName &&
        !/^unknown( contact)?$/i.test(contactName.trim()) && // Regex for case-insensitive check
        contactName.trim() !== ""
          ? contactName
          : null;

      // Determine INITIAL display name (ALWAYS use phone as minimum)
      let displayName = sanitizedContactName || phone;

      // CRM CONTACT SYNC (Find or Create)
      let crmContact = await prisma.contact.findFirst({
        where: {
          companyId,
          OR: [{ phone: phone }, { phone: `+${phone}` }],
        },
      });

      console.log(`📇 [MessageProcessor] CRM Contact Search:`, {
        found: !!crmContact,
        currentName: crmContact?.name,
        currentId: crmContact?.id,
      });

      if (!crmContact && !isOutbound) {
        // Create NEW Contact with clean name
        console.log(
          `👤 [MessageProcessor] Creating NEW CRM Contact with name: "${displayName}"`
        );
        try {
          crmContact = await prisma.contact.create({
            data: {
              companyId,
              name: displayName, // Will be phone or real name, NEVER "Unknown"
              phone: phone,
              tags: ["WHATSAPP_LEAD"],
            },
          });
          console.log(
            `✅ [MessageProcessor] CRM Contact Created: ${crmContact.id}`
          );
        } catch (e) {
          console.error("❌ Failed to create CRM contact", e);
        }
      } else if (crmContact) {
        // 🔥 CRITICAL: Update old contact BEFORE using its name
        const contactHasBadName =
          !crmContact.name ||
          crmContact.name === "Unknown" ||
          crmContact.name === "Unknown Contact" ||
          crmContact.name.trim() === "";

        const weHaveBetterName =
          sanitizedContactName && sanitizedContactName !== phone;

        // Update if: contact name is bad, OR we have a better name
        if (
          contactHasBadName ||
          (weHaveBetterName && crmContact.name !== sanitizedContactName)
        ) {
          const newName = weHaveBetterName ? sanitizedContactName : phone;
          console.log(
            `♻️ [MessageProcessor] Updating CRM Contact "${crmContact.name}" → "${newName}"`
          );

          try {
            crmContact = await prisma.contact.update({
              where: { id: crmContact.id },
              data: { name: newName },
            });
            console.log(`✅ [MessageProcessor] CRM Contact Updated`);
          } catch (e) {
            console.error("❌ Failed to update CRM contact", e);
          }
        }
      }

      // 🔥 NOW determine FINAL displayName from cleaned Contact
      if (
        crmContact &&
        crmContact.name &&
        crmContact.name !== "Unknown" &&
        crmContact.name !== "Unknown Contact"
      ) {
        displayName = crmContact.name;
        console.log(
          `📝 [MessageProcessor] Using CRM Contact name: "${displayName}"`
        );
      } else {
        // Fallback to phone if contact somehow still has bad name
        displayName = sanitizedContactName || phone;
        console.log(
          `📝 [MessageProcessor] Using fallback name: "${displayName}"`
        );
      }

      console.log(`✨ [MessageProcessor] FINAL Display Name: "${displayName}"`);

      // 1. Find or Create CUSTOMER User
      let customerUser = await prisma.user.findFirst({
        where: {
          email: `${phone}@whatsapp.user`,
          companyId: companyId,
        },
      });

      if (!customerUser) {
        console.log(
          `🆕 [MessageProcessor] Creating NEW User with name: "${displayName}"`
        );
        customerUser = await prisma.user.create({
          data: {
            email: `${phone}@whatsapp.user`,
            name: displayName, // Now guaranteed to be clean
            phone: phone, // 🔥 EXPLICITLY STORE PHONE
            password: await bcrypt.hash("123456", 10),
            role: "USER",
            companyId: companyId,
          },
        });
        console.log(`✅ [MessageProcessor] User Created: ${customerUser.id}`);
      } else {
        console.log(
          `🔍 [MessageProcessor] Found existing User: ${customerUser.id}, name: "${customerUser.name}"`
        );

        // Update User if name is bad or we have better name
        const currentName = customerUser.name || "";
        const userNameIsBad =
          currentName === "Unknown" ||
          currentName === "Unknown Contact" ||
          currentName === "";

        const needsUpdate =
          userNameIsBad || currentName !== displayName || !customerUser.phone; // Also update if phone is missing

        if (needsUpdate) {
          console.log(
            `♻️ [MessageProcessor] Updating User name: "${currentName}" → "${displayName}"`
          );
          try {
            customerUser = await prisma.user.update({
              where: { id: customerUser.id },
              data: {
                name: displayName,
                phone: phone, // 🔥 ENSURE PHONE IS SAVED
              },
            });
            console.log(`✅ [MessageProcessor] User Updated`);
          } catch (e) {
            console.error("❌ Failed to update User", e);
          }
        }
      }

      // Determine Sender ID
      let dbSenderId = customerUser.id;
      // UNUSED: let dbSenderName = customerUser.name || phone;

      if (isOutbound) {
        // Find Admin/Agent sender
        const adminUser = await prisma.user.findFirst({
          where: {
            companyId,
            role: { in: ["ADMIN", "MASTER"] },
          },
          orderBy: { createdAt: "asc" },
        });

        if (adminUser) {
          dbSenderId = adminUser.id;
          // dbSenderName = adminUser.name || "Admin";
        } else {
          const anyUser = await prisma.user.findFirst({ where: { companyId } });
          if (anyUser) {
            dbSenderId = anyUser.id;
            // dbSenderName = anyUser.name || "User";
          }
        }
      }

      // 2. Find or Create Conversation
      // 2. Find or Create Conversation
      // SENIOR FIX: Legacy Data Support
      // Search for clean phone OR full JID to prevent duplicate conversations
      let conversation = await prisma.conversation.findFirst({
        where: {
          companyId: companyId,
          OR: [{ channelId: phone }, { channelId: `${phone}@s.whatsapp.net` }],
        },
        orderBy: { updatedAt: "desc" },
      });

      // Data Normalization: If found with dirty/legacy ID, clean it!
      if (conversation && conversation.channelId !== phone) {
        console.log(
          `🧹 [MessageProcessor] Migrating Legacy Conversation ID: ${conversation.id}`
        );
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { channelId: phone },
        });
        conversation.channelId = phone;
      }

      if (!conversation) {
        // Create NEW Conversation
        let assignedToId = null;
        try {
          const agents = await prisma.user.findMany({
            where: {
              companyId,
              role: { in: ["AGENT", "ADMIN"] },
              email: { not: { startsWith: "bot_" } },
            },
            select: { id: true },
          });
          if (agents.length > 0) {
            const randomIndex = Math.floor(Math.random() * agents.length);
            assignedToId = agents[randomIndex].id;
          }
        } catch (e) {
          // Ignore assignment error
        }

        conversation = await prisma.conversation.create({
          data: {
            companyId,
            channelId: phone, // Store ONLY the phone number
            assignedToId,
            status: "OPEN",
            subject: displayName, // Set conversation title to Phone/Name
          },
        });

        // 🔥 CRITICAL FIX: Create corresponding TICKET for persistence
        // This ensures data survives page reloads (frontend loads tickets, not conversations)
        try {
          // Get next ticket number
          const lastTicket = await prisma.ticket.findFirst({
            where: { companyId },
            orderBy: { ticketNumber: "desc" },
            select: { ticketNumber: true },
          });
          const nextTicketNumber = (lastTicket?.ticketNumber || 0) + 1;

          await prisma.ticket.create({
            data: {
              subject: displayName, // Use resolved name/phone as subject
              description: `WhatsApp conversation with ${displayName}`,
              ticketNumber: nextTicketNumber,
              priority: "MEDIUM",
              status: "OPEN",
              companyId,
              createdById: customerUser.id, // Link to customer user
              conversationId: conversation.id, // Link to conversation
              assignedToId: assignedToId, // Assign to same agent
            },
          });
          console.log(
            `✅ [MessageProcessor] Created TICKET #${nextTicketNumber} for conversation ${conversation.id}`
          );
        } catch (ticketError) {
          console.error(
            "[MessageProcessor] ⚠️ Failed to create ticket (non-critical):",
            ticketError
          );
          // Continue even if ticket creation fails
        }
      } else {
        // Ensure subject is updated if we have a better name
        if (conversation.subject !== displayName) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { subject: displayName },
          });
          conversation.subject = displayName;
        }
      }

      // 3. Create Message
      const newMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: dbSenderId,
          channel: "WHATSAPP",
          direction: isOutbound ? "OUTBOUND" : "INBOUND",
          content: text || "",
          createdAt: new Date(),
          metadata: hasMedia ? { media } : undefined,
        },
        include: { sender: true }, // Include sender for Real-Time UI
      });

      // 4. Update Conversation Stats
      // Keep only valid fields
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: isOutbound ? conversation.status : "OPEN",
          subject: displayName, // Update title if name changed
        },
      });

      // 5. Emit Socket Events
      const io = gateway.getIO();
      if (io) {
        console.log(
          `[MessageProcessor] 📡 EMITTING SOCKET EVENT to Room ID: [${conversation.id}]`
        );
        // Emit to conversation room (for chat window)
        io.to(conversation.id).emit("conversation.new_message", newMessage);

        // Mock unread count for frontend if not in DB
        // For inbound messages, we want to ensure the badge shows at least '1'
        let currentUnread = (conversation as any).unreadCount || 0;
        if (!isOutbound) {
          currentUnread = currentUnread > 0 ? currentUnread + 1 : 1;
        }

        // CONSTRUCT PAYLOAD EXPLICITLY TO AVOID POLLUTION
        const socketPayload = {
          ...conversation,
          subject: displayName, // Ensure subject is carried over
          lastMessagePreview: text.substring(0, 50),
          lastMessageAt: new Date(),
          unreadCount: currentUnread,
          contact: {
            id: crmContact?.id || conversation.channelId,
            name: displayName,
            phone: conversation.channelId, // This is the clean phone (e.g. 57300...)
            channelId: conversation.channelId,
            companyId: companyId,
            avatarUrl:
              crmContact?.avatarUrl ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                displayName
              )}`,
          },
        };

        console.log(
          "📦 [MessageProcessor] FULL SOCKET PAYLOAD:",
          JSON.stringify(socketPayload, null, 2)
        );

        // Emit to company room (for dashboard list update)
        io.to(`company:${companyId}`).emit(
          "conversation.updated",
          socketPayload
        );
      } else {
        console.warn(
          "[MessageProcessor] ⚠️ Socket Gateway not ready. Skipping event emission."
        );
      }
    } catch (err) {
      console.error(
        "[MessageProcessor] 🛑 CRITICAL ERROR in _processMessage:",
        err
      );
      // Log stack trace for better debugging
      if (err instanceof Error) {
        console.error(err.stack);
      }
    }
  },
};
