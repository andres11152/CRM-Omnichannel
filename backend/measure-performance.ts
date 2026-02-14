import { prisma } from "./src/config/database";
import { toTicketDTO } from "./src/types/ticket.types";
import { contextStorage } from "./src/context/requestContext";

async function measure() {
  const companyId = "99999999-9999-9999-9999-999999999999";
  console.log("--- MEASURING TICKETS FETCH ---");

  await contextStorage.run({ companyId: "__SYSTEM__" }, async () => {
    const start = Date.now();
    const tickets = await prisma.ticket.findMany({
      where: { companyId },
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
    console.log(
      `DB fetch took: ${Date.now() - start}ms (found ${tickets.length})`,
    );

    const mapStart = Date.now();
    const dtos = tickets.map((t) => toTicketDTO(t as any));
    console.log(`Mapping took: ${Date.now() - mapStart}ms`);

    const enrichStart = Date.now();
    // Simplified version of enrichWithCrmData logic
    const phonesToFetch = new Set<string>();
    dtos.forEach((t) => {
      if (t.contact.phone) phonesToFetch.add(t.contact.phone);
    });

    const wsStart = Date.now();
    const whatsappSessions = await prisma.whatsAppSession.findMany({
      where: { companyId, status: "CONNECTED" },
      orderBy: { createdAt: "asc" },
    });
    console.log(`WS sessions fetch took: ${Date.now() - wsStart}ms`);

    const contactStart = Date.now();
    const contacts = await prisma.contact.findMany({
      where: {
        companyId,
        phone: { in: Array.from(phonesToFetch) },
      },
    });
    console.log(`Contacts fetch took: ${Date.now() - contactStart}ms`);

    console.log(`Total measure took: ${Date.now() - start}ms`);
  });
}

measure()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
