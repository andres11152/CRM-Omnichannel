import { searchRepository } from "@/repositories/SearchRepository";

/**
 * [SEARCH] GLOBAL SEARCH SERVICE
 * Unified cross-entity search for Command Palette (Cmd+K)
 * Optimized for <100ms responses on databases with ~10k records
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
   * Global search across multiple entities
   * @param query - Search term (min 2 characters)
   * @param companyId - Company ID (tenant isolation)
   * @returns Results grouped by category
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
      searchRepository.searchContacts(companyId, searchTerm),

      // 2. Search Tickets
      searchRepository.searchTickets(companyId, searchTerm),

      // 3. Search Deals (CRM Module)
      searchRepository.searchDeals(companyId, searchTerm),
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
