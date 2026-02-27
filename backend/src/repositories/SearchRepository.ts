import { prisma } from "@/config/database";

export const searchRepository = {
  async searchContacts(companyId: string, searchTerm: string) {
    return prisma.contact.findMany({
      where: {
        companyId,
        OR: [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { phone: { contains: searchTerm, mode: "insensitive" } },
          { email: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });
  },

  async searchTickets(companyId: string, searchTerm: string) {
    return prisma.ticket.findMany({
      where: {
        companyId,
        OR: [
          { subject: { contains: searchTerm, mode: "insensitive" } },
          ...(isNaN(Number(searchTerm))
            ? []
            : [{ ticketNumber: Number(searchTerm) }]),
        ],
      },
      select: {
        id: true,
        subject: true,
        ticketNumber: true,
        status: true,
      },
      take: 5,
      orderBy: { createdAt: "desc" },
    });
  },

  async searchDeals(companyId: string, searchTerm: string) {
    return prisma.deal.findMany({
      where: {
        companyId,
        title: { contains: searchTerm, mode: "insensitive" },
      },
      select: {
        id: true,
        title: true,
        value: true,
        stage: {
          select: { name: true },
        },
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });
  },
};
