import { useEffect } from "react";
import { socketService } from "@/services/socketService";
import { Ticket, User, Channel } from "@/types";
import { resolveContactName } from "@/utils/contactUtils";
import { BASE_URL } from "@/services/apiConfig";

//  100-Year Solution: Strict typing for socket payloads
// Using flexible types for socket data that will be validated before use
interface SocketContactData {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  channelId?: string;
  avatarUrl?: string;
  profilePicUrl?: string | null;
  about?: string | null;
  status?: string;
  isGroup?: boolean;
}

interface ConversationUpdatePayload {
  id: string;
  subject?: string;
  channelId?: string;
  lastMessage?: string | { content: string };
  lastMessagePreview?: string;
  content?: string;
  lastMessageAt?: string;
  senderType?: "USER" | "AGENT" | "BOT";
  direction?: "INBOUND" | "OUTBOUND";
  contact?: SocketContactData;
  assignedToId?: string; // [ONLINE] Added this field from backend emission
}

//  100-Year Solution: Payload for ticket.assigned event
interface TicketAssignedPayload {
  ticket: Ticket;
  message: string;
  assignedBy: string;
  timestamp: string;
}

interface UseAgentWorkspaceSocketsProps {
  user: User | undefined | null;
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>;
  activeTicketIdRef: React.MutableRefObject<string | null>;
  setActiveTicketId: (id: string | null) => void;
  fetchData: (isBackground?: boolean) => void;
  triggerBackgroundRefresh: () => void;
}

export const useAgentWorkspaceSockets = ({
  user,
  setTickets,
  activeTicketIdRef,
  setActiveTicketId,
  fetchData,
  triggerBackgroundRefresh,
}: UseAgentWorkspaceSocketsProps) => {

  //  NOTIFICATION SOUND (Synthesized Pop - Zero Latency, No CORS issues)
  const playNotificationSound = () => {
    try {
      const audioCtx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = "sine";
      // Start at a higher pitch and quickly sweep down (pop effect)
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        100,
        audioCtx.currentTime + 0.1,
      );

      // Volume envelope (quick fade out)
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioCtx.currentTime + 0.1,
      );

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn("Audio synthesis blocked or not supported", e);
    }
  };

  useEffect(() => {
    console.log("[AgentWorkspace] [OK] Business event listeners initializing");
    fetchData();

    const handleConversationUpdated = (payload: ConversationUpdatePayload) => {
      setTickets((prev) => {
        // [SEC] Robust Search: Find by ConvID OR ID (handling ghost tickets)
        const ticketIndex = prev.findIndex(
          (t) => t.conversationId === payload.id || t.id === payload.id,
        );

        let resolvedName;

        if (ticketIndex === -1) {
          // NEW TICKET
          const tempContact = {
            ...payload.contact,
            phone: payload.contact?.phone || payload.channelId,
          };
          resolvedName = resolveContactName(tempContact, payload.subject);
        } else {
          // EXISTING TICKET
          const existingTicket = prev[ticketIndex];
          if (payload.contact) {
            const tempContact = {
              ...payload.contact,
              phone: payload.contact?.phone || payload.channelId,
            };
            resolvedName = resolveContactName(
              tempContact,
              payload.subject || existingTicket.subject,
            );
          } else {
            resolvedName = existingTicket.contact?.name;
          }
        }

        //  PLAY SOUND if Inbound & Message Content exists
        const isOutbound =
          payload.senderType === "AGENT" || payload.direction === "OUTBOUND";
        if (
          !isOutbound &&
          (payload.lastMessage || payload.lastMessagePreview)
        ) {
          playNotificationSound();
        }

        if (ticketIndex === -1) {
          //  OPTIMISTIC APPEND
          let newTicketLastMessage = "Nuevo mensaje";
          if (typeof payload.lastMessage === "string") {
            newTicketLastMessage = payload.lastMessage;
          } else if (payload.lastMessage?.content) {
            newTicketLastMessage = payload.lastMessage.content;
          } else if (payload.lastMessagePreview) {
            newTicketLastMessage = payload.lastMessagePreview;
          }

          // Construct proper Ticket object with defaults for optimistic update
          const newTicket: Ticket = {
            id: payload.id,
            conversationId: payload.id,
            companyId: (user?.companyId as string) || "", // Fallback if missing
            ticketNumber: 0, // Optimistic placeholder
            subject: payload.subject || "Nuevo Chat",
            priority: "MEDIUM",
            contact: {
              id: payload.contact?.id || payload.id,
              companyId: (user?.companyId as string) || "",
              name: resolvedName,
              phone: payload.channelId || "",
              channelId: payload.contact?.channelId || payload.id,
              avatarUrl: payload.contact?.avatarUrl || "",
              profilePicUrl: payload.contact?.profilePicUrl?.startsWith("/")
                ? `${BASE_URL}${payload.contact.profilePicUrl}`
                : payload.contact?.profilePicUrl,
              about: payload.contact?.about,
              unreadCount: 1,
              status: "OPEN",
            },
            status: "OPEN",
            channel: Channel.WHATSAPP,
            lastMessage: newTicketLastMessage,
            // Ensure Date object compatibility
            lastMessageAt: new Date(
              payload.lastMessageAt || Date.now(),
            ).toISOString(),
            createdAt: new Date().toISOString(),
            unreadCount: 1,
            tags: [],
            assignedToId: payload.assignedToId || undefined, // [ONLINE] Correctly set assignment from payload
            queueId: null,

            // Fix strict Ticket interface requirements
            description: null,
            queue: null,
            assignedTo: null,
            updatedAt: new Date().toISOString(),
          };

          triggerBackgroundRefresh();
          return [newTicket, ...prev];
        }

        // Update Existing Ticket
        const updatedTickets = [...prev];
        const ticket = updatedTickets[ticketIndex];
        const currentActiveId = activeTicketIdRef.current;

        //  UNREAD COUNT LOGIC
        const isCurrentChatActive =
          currentActiveId === ticket.id ||
          currentActiveId === ticket.conversationId;
        const currentCount = Number(ticket.unreadCount) || 0;

        const newUnreadCount = isCurrentChatActive ? 0 : currentCount + 1;

        //  LAST MESSAGE LOGIC ROBUST FIX
        let incomingMessage = ticket.lastMessage;

        // [PERF] Debug logging removed - JSON.stringify on every socket event was expensive

        if (payload.content) {
          incomingMessage = payload.content;
        } else if (typeof payload.lastMessage === "string") {
          incomingMessage = payload.lastMessage;
        } else if (payload.lastMessage?.content) {
          incomingMessage = payload.lastMessage.content;
        } else if (payload.lastMessagePreview) {
          incomingMessage = payload.lastMessagePreview;
        }

        // [SEC] Ensure Valid Date
        let newDate = ticket.lastMessageAt;
        if (payload.lastMessageAt) {
          newDate = payload.lastMessageAt;
        } else {
          // If no date provided but we have new content, use Now
          newDate = new Date().toISOString();
        }

        const isPhone = (val: string | undefined | null) => 
          !val || /^\+?\d+$/.test(val.replace(/\s/g, ""));

        const isIncomingNameBetter = resolvedName && !isPhone(resolvedName) && resolvedName !== "Usuario WhatsApp" && resolvedName !== "Sin Nombre";
        const isExistingNameBetter = ticket.contact?.name && !isPhone(ticket.contact.name) && ticket.contact.name !== "Usuario WhatsApp" && ticket.contact.name !== "Sin Nombre";

        updatedTickets[ticketIndex] = {
          ...ticket,
          lastMessage: incomingMessage,
          lastMessageAt: newDate,
          unreadCount: newUnreadCount,
          contact: {
            ...ticket.contact,
            ...(payload.contact || {}),
            name: (isExistingNameBetter && !isIncomingNameBetter) ? ticket.contact.name : resolvedName,
            profilePicUrl:
              (payload.contact?.profilePicUrl?.startsWith("/")
                ? `${BASE_URL}${payload.contact.profilePicUrl}`
                : payload.contact?.profilePicUrl) ||
              ticket.contact?.profilePicUrl,
            about: payload.contact?.about || ticket.contact?.about,
          },
        };

        updatedTickets.sort(
          (a, b) =>
            new Date(b.lastMessageAt).getTime() -
            new Date(a.lastMessageAt).getTime(),
        );

        return updatedTickets;
      });
    };

    console.log(
      "[AgentWorkspace] [WS] Registering conversation.updated listener",
    );
    socketService.on("conversation.updated", handleConversationUpdated);

    // Listener for Ticket Deletion
    const handleTicketDeleted = (data: { ticketId: string }) => {
      console.log("[AgentWorkspace] ️ Ticket deleted:", data.ticketId);
      setTickets((prev) => prev.filter((t) => t.id !== data.ticketId));
      if (activeTicketIdRef.current === data.ticketId) {
        setActiveTicketId(null);
      }
    };
    socketService.on("ticket_deleted", handleTicketDeleted);

    // [SYNC] TICKET TRANSFER/UPDATE LISTENER
    // This handles when a ticket is reassigned to another agent
    // [SYNC] TICKET TRANSFER/UPDATE LISTENER
    const handleTicketUpdated = (data: {
      ticket: Ticket;
      changedFields: string[];
    }) => {
      // [DEBUG] DEBUG (Console Log)
      console.log(
        `Update Socket: ${data.ticket.assignedToId ? "Asignado" : "Sin Asignar"}`,
      );

      console.log(
        "[AgentWorkspace] [SYNC] Ticket updated payload:",
        data.ticket.id,
        "AssignedTo:",
        data.ticket.assignedToId,
        "Fields:",
        data.changedFields,
      );

      setTickets((prev) => {
        // [DEDUP] Match on the UNIFIED identity (id ↔ conversationId). An optimistic
        // ticket created from conversation.updated uses conversationId as its `id`, so a
        // plain `t.id === data.ticket.id` lookup misses it and would append a duplicate.
        const ticketIndex = prev.findIndex(
          (t) =>
            t.id === data.ticket.id ||
            (data.ticket.conversationId &&
              (t.conversationId === data.ticket.conversationId ||
                t.id === data.ticket.conversationId)) ||
            (t.conversationId && t.conversationId === data.ticket.id),
        );

        // [SEC] 100-YEAR FIX: Role-aware visibility
        // ADMINs/SUPERVISORs see ALL tickets (company-wide view)
        // AGENTs only see tickets assigned to them or unassigned/queue
        const isAdminOrSupervisor = ["ADMIN", "SUPERVISOR", "MASTER"].includes(
          user?.role || "",
        );

        // CASE 1: Ticket NOT in list
        if (ticketIndex === -1) {
          // Admins get all tickets
          if (isAdminOrSupervisor) {
            console.log(
              "[AgentWorkspace]  Admin: Adding ticket to view:",
              data.ticket.id,
            );
            return [data.ticket, ...prev];
          }

          // Agents: Only add if assigned to them or unassigned
          const isForMe = data.ticket.assignedToId === user?.id;
          const isForQueue = !data.ticket.assignedToId; // Null/undefined means Queue/Unassigned

          if (isForMe || isForQueue) {
            console.log(
              "[AgentWorkspace]  Agent: New relevant ticket arrived:",
              data.ticket.id,
            );
            return [data.ticket, ...prev];
          }
          return prev;
        }

        // CASE 2: Ticket IS in list - Check if we should KEEP it
        const incoming = data.ticket;

        // Admins always keep tickets in their view
        if (isAdminOrSupervisor) {
          const updatedTickets = [...prev];
          const existingTicket = updatedTickets[ticketIndex];
          const isPhone = (val: string | undefined | null) => 
            !val || /^\+?\d+$/.test(val.replace(/\s/g, ""));
            
          const isIncomingNameBetter = incoming.contact?.name && !isPhone(incoming.contact.name) && incoming.contact.name !== "Usuario WhatsApp" && incoming.contact.name !== "Sin Nombre";
          const isExistingNameBetter = existingTicket.contact?.name && !isPhone(existingTicket.contact.name) && existingTicket.contact.name !== "Usuario WhatsApp" && existingTicket.contact.name !== "Sin Nombre";

          updatedTickets[ticketIndex] = {
            ...existingTicket,
            ...incoming,
            contact: {
              ...existingTicket.contact,
              ...incoming.contact,
              name: (isExistingNameBetter && !isIncomingNameBetter) ? existingTicket.contact.name : (incoming.contact?.name || existingTicket.contact?.name),
              profilePicUrl: (incoming.contact?.profilePicUrl?.startsWith("/") ? `${BASE_URL}${incoming.contact.profilePicUrl}` : incoming.contact?.profilePicUrl) || existingTicket.contact?.profilePicUrl
            },
          };
          return updatedTickets;
        }

        // Agents: Check if still relevant
        const isAssignedToMe = incoming.assignedToId === user?.id;
        const isUnassigned = !incoming.assignedToId;

        // [SEC] SECURITY/PRIVACY: If assigned to ANOTHER agent, remove it immediately.
        // Agents should not see tickets assigned to others.
        if (!isAssignedToMe && !isUnassigned) {
          console.log(
            "[AgentWorkspace]  Ticket reassigned to another agent. Removing from view.",
            incoming.id,
          );

          // CRITICAL FIX: If this was the active ticket, deselect it immediately
          if (
            activeTicketIdRef.current === incoming.id ||
            activeTicketIdRef.current === incoming.conversationId
          ) {
            console.log(
              "[AgentWorkspace]  Deselecting active ticket as it was transferred",
            );
            setActiveTicketId(null);
          }

          // Remove the matched entry (could be the optimistic one keyed by conversationId)
          return prev.filter((_, idx) => idx !== ticketIndex);
        }

        // Update logic (preserve local overrides if valid)
        if (ticketIndex === -1) {
          // 🆕 NEW TICKET CASE: Ticket matches criteria but not in list? Add it!
          console.log(
            "[AgentWorkspace] 🆕 New ticket received via socket:",
            incoming.id,
          );
          return [incoming, ...prev];
        }

        const updatedTickets = [...prev];
        const existingTicket = updatedTickets[ticketIndex];
        const isPhone = (val: string | undefined | null) => 
          !val || /^\+?\d+$/.test(val.replace(/\s/g, ""));
          
        const isIncomingNameBetter = incoming.contact?.name && !isPhone(incoming.contact.name) && incoming.contact.name !== "Usuario WhatsApp" && incoming.contact.name !== "Sin Nombre";
        const isExistingNameBetter = existingTicket.contact?.name && !isPhone(existingTicket.contact.name) && existingTicket.contact.name !== "Usuario WhatsApp" && existingTicket.contact.name !== "Sin Nombre";

        updatedTickets[ticketIndex] = {
          ...existingTicket,
          ...incoming,
          // Ensure contact info is merged not lost
          contact: {
            ...existingTicket.contact,
            ...incoming.contact,
            name: (isExistingNameBetter && !isIncomingNameBetter) ? existingTicket.contact.name : (incoming.contact?.name || existingTicket.contact?.name),
            profilePicUrl: (incoming.contact?.profilePicUrl?.startsWith("/") ? `${BASE_URL}${incoming.contact.profilePicUrl}` : incoming.contact?.profilePicUrl) || existingTicket.contact?.profilePicUrl
          },
        };

        return updatedTickets;
      });

      // [SEC] 100-YEAR FIX: DO NOT trigger immediate background refresh here.
      // The socket event already provides complete ticket data.
      // Immediate refresh was causing a race condition where the server hadn't
      // fully propagated the assignment, causing the ticket to disappear.
      // The socket data is the source of truth for real-time updates.
    };
    socketService.on("ticket.updated", handleTicketUpdated);

    //  ENTERPRISE: Ticket Assigned Listener (for agents receiving new assignments)
    const handleTicketAssigned = (data: TicketAssignedPayload) => {
      console.log(
        "[AgentWorkspace]  Ticket assigned to me:",
        data.ticket.id,
        "by",
        data.assignedBy,
      );

      // Play notification sound
      playNotificationSound();

      // [SEC] SECURITY & UX: Enrich ticket before adding to state
      // Ensure it has the correct assignment ID so it passes the 'My Chats' filter
      const enrichedTicket = { ...data.ticket };

      if (
        user &&
        (!enrichedTicket.assignedToId ||
          enrichedTicket.assignedToId !== user.id)
      ) {
        // If I received this event, it MUST be for me (room security).
        console.warn(
          "[AgentWorkspace] [WARNING] Fixing missing/mismatched assignedToId on incoming ticket",
        );
        enrichedTicket.assignedToId = user?.id; // Fallback to current user
      }

      // Ensure it pops to top
      if (!enrichedTicket.lastMessageAt) {
        enrichedTicket.lastMessageAt = new Date().toISOString();
      }

      // Force status to something active if it was closed
      if (
        enrichedTicket.status === "CLOSED" ||
        enrichedTicket.status === "RESOLVED"
      ) {
        enrichedTicket.status = "IN_PROGRESS";
      }

      // Add ticket to list if not already present (unified id ↔ conversationId match
      // so we reconcile with an optimistic entry instead of duplicating it).
      setTickets((prev) => {
        const matches = (t: Ticket) =>
          t.id === enrichedTicket.id ||
          (enrichedTicket.conversationId &&
            (t.conversationId === enrichedTicket.conversationId ||
              t.id === enrichedTicket.conversationId)) ||
          (t.conversationId && t.conversationId === enrichedTicket.id);

        if (prev.some(matches)) {
          return prev.map((t) => (matches(t) ? { ...t, ...enrichedTicket } : t));
        }
        // Add new ticket to the top
        return [enrichedTicket, ...prev];
      });
    };
    socketService.on("ticket.assigned", handleTicketAssigned);

    // Real-time profile picture updates from WhatsApp (contacts.update Baileys event
    // or after ProfilePictureService.fetchAndPersist completes for new contacts).
    const handleContactUpdated = (data: {
      id?: string;
      profilePicUrl?: string | null;
      phone?: string | null;
    }) => {
      if (!data.profilePicUrl) return;
      const resolvedUrl = data.profilePicUrl.startsWith("/")
        ? `${BASE_URL}${data.profilePicUrl}`
        : data.profilePicUrl;
      const normalizedPhone = data.phone?.replace(/\D/g, "");
      setTickets((prev) =>
        prev.map((t) => {
          const idMatch = data.id && (t.contact.id === data.id || t.contact.realContactId === data.id);
          const phoneMatch = normalizedPhone && t.contact.phone?.replace(/\D/g, "") === normalizedPhone;
          if (idMatch || phoneMatch) {
            return { ...t, contact: { ...t.contact, profilePicUrl: resolvedUrl } };
          }
          return t;
        }),
      );
    };
    socketService.on("contact.updated", handleContactUpdated);

    console.log("[AgentWorkspace] [OK] Listeners registered");

    return () => {
      console.log("[AgentWorkspace]  Unmounting - Removing Listeners");
      socketService.off("conversation.updated", handleConversationUpdated);
      socketService.off("ticket_deleted", handleTicketDeleted);
      socketService.off("ticket.updated", handleTicketUpdated);
      socketService.off("ticket.assigned", handleTicketAssigned);
      socketService.off("contact.updated", handleContactUpdated);
    };
  }, [user?.companyId]); // Depend on user.companyId
};
