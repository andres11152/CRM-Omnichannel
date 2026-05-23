import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  try {
    const target = "cmph46s8900jn3t9l2rsxr6jt";
    console.log("Searching for ID anywhere in DB:", target);

    // Search Ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: target }
    });
    console.log("Ticket search:", ticket);

    // Search Message
    const msg = await prisma.message.findUnique({
      where: { id: target }
    });
    console.log("Message search:", msg);

    // Search Contact
    const contact = await prisma.contact.findUnique({
      where: { id: target }
    });
    console.log("Contact search:", contact);

    // Search User
    const user = await prisma.user.findUnique({
      where: { id: target }
    });
    console.log("User search:", user);

    // Search Conversation by any field or general check
    const convSearch = await prisma.conversation.findMany({
      where: {
        OR: [
          { id: target },
          { channelId: target },
        ]
      }
    });
    console.log("Conversation search:", convSearch);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
