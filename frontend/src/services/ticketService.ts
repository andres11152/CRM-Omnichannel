import { api } from "@/lib/axios";
import { Ticket, ResolveTicketDTO, TransferTicketDTO } from "@/types";

/**
 * Fetch tickets with optional filters
 */
export const getTickets = async (
  filters: { status?: string; assigneeId?: string; queueId?: string } = {},
): Promise<Ticket[]> => {
  const params = new URLSearchParams();
  if (filters.status) params.append("status", filters.status);
  if (filters.assigneeId) params.append("assigneeId", filters.assigneeId);
  if (filters.queueId) params.append("queueId", filters.queueId);

  const res = await api.get(`/tickets?${params.toString()}`);
  const result = res.data.data?.tickets ?? res.data.data ?? res.data;
  return Array.isArray(result) ? result : [];
};

/**
 * Resolve a ticket with a specific outcome and optional notes
 */
export const resolveTicket = async (
  ticketId: string,
  data: ResolveTicketDTO,
): Promise<Ticket> => {
  const res = await api.patch(`/tickets/${ticketId}`, data);
  return res.data.data?.ticket || res.data.data || res.data;
};

/**
 * Transfer a ticket to another agent or queue
 */
export const transferTicket = async (
  ticketId: string,
  data: TransferTicketDTO,
): Promise<Ticket> => {
  const res = await api.patch(`/tickets/${ticketId}`, data);
  return res.data.data?.ticket || res.data.data || res.data;
};

/**
 * Change ticket priority
 */
export const updatePriority = async (
  ticketId: string,
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT",
): Promise<Ticket> => {
  const res = await api.patch(`/tickets/${ticketId}`, { priority });
  return res.data.data?.ticket || res.data.data || res.data;
};

/**
 * Update ticket status (Kanban drag & drop)
 */
export const updateTicketStatus = async (
  ticketId: string,
  status: string,
): Promise<Ticket> => {
  const res = await api.patch(`/tickets/${ticketId}`, { status });
  return res.data.data?.ticket || res.data.data || res.data;
};

/**
 * General ticket update (assign agent, etc)
 */
export const updateTicket = async (
  ticketId: string,
  data: Partial<Ticket> & { assignedToId?: string },
): Promise<Ticket> => {
  const res = await api.patch(`/tickets/${ticketId}`, data);
  return res.data.data?.ticket || res.data.data || res.data;
};

// Default export object for backward compatibility if needed,
// though strictly we should move to named imports everywhere.
// For now, let's keep it clean with ONLY named exports as requested by the error.

