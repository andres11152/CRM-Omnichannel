import { prisma } from "@/config/database";

/**
 * 🔍 GLOBAL SEARCH SERVICE
 * Búsqueda unificada cross-entity para Command Palette (Cmd+K)
 * Optimizado para respuestas <100ms en bases de datos con ~10k registros
 */

interface SearchResult {
  contacts: Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    type: "contact";
  }>;
  tickets: Array<{
    id: string;
    subject: string;
    ticketNumber: number;
    status: string;
    type: "ticket";
  }>;
  deals: Array<{
    id: string;
    title: string;
    value: number;
    stageName: string;
    type: "deal";
  }>;
}

export const searchService = {
  /**
   * Búsqueda global en múltiples entidades
   * @param query - Término de búsqueda (mínimo 2 caracteres)
   * @param companyId - ID de la compañía (tenant isolation)
   * @returns Resultados agrupados por categoría
   */
  async globalSearch(query: string, companyId: string): Promise<SearchResult> {
    // Sanitize input
    const searchTerm = query.trim();

    if (searchTerm.length < 2) {
      return { contacts: [], tickets: [], deals: [] };
    }

    // Parallel search for performance (Promise.all)
    const [contacts, tickets, deals] = await Promise.all([
      // 1. Search Contacts
      prisma.contact.findMany({
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
        orderBy: { updatedAt: "desc" }, // Most recent interactions first
      }),

      // 2. Search Tickets
      prisma.ticket.findMany({
        where: {
          companyId,
          OR: [
            { subject: { contains: searchTerm, mode: "insensitive" } },
            // ticketNumber is Int, so we check if searchTerm is numeric
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
      }),

      // 3. Search Deals (CRM Module)
      prisma.deal.findMany({
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
      }),
    ]);

    // Transform and type-tag results
    return {
      contacts: contacts.map((c) => ({ ...c, type: "contact" as const })),
      tickets: tickets.map((t) => ({ ...t, type: "ticket" as const })),
      deals: deals.map((d) => ({
        id: d.id,
        title: d.title,
        value: d.value,
        stageName: d.stage?.name || "Sin etapa",
        type: "deal" as const,
      })),
    };
  },
};
