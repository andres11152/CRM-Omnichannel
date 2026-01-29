import { useEffect } from "react";
import { socketService } from "../../services/socketService";
import { Ticket, User, Channel } from "../../types";
import { resolveContactName } from "../utils/contactUtils";
import { BASE_URL } from "../../services/apiConfig";

interface UseAgentWorkspaceSocketsProps {
  user: User | undefined | null;
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>;
  activeTicketIdRef: React.MutableRefObject<string | null>;
  setSocketConnected: (connected: boolean) => void;
  setActiveTicketId: (id: string | null) => void;
  fetchData: (isBackground?: boolean) => void;
  triggerBackgroundRefresh: () => void;
}

export const useAgentWorkspaceSockets = ({
  user,
  setTickets,
  activeTicketIdRef,
  setSocketConnected,
  setActiveTicketId,
  fetchData,
  triggerBackgroundRefresh,
}: UseAgentWorkspaceSocketsProps) => {
  // 🔔 NOTIFICATION SOUND (Base64 for reliability)
  const playNotificationSound = () => {
    try {
      const audio = new Audio(
        "https://cdn.freesound.org/previews/536/536108_11585250-lq.mp3",
      ); // Subtle 'Pop' sound
      audio.volume = 0.5;
      audio.play().catch((e) => console.warn("Audio play blocked", e));
    } catch (e) {
      console.error("Audio error", e);
    }
  };

  useEffect(() => {
    console.log("[AgentWorkspace] ✅ Services Initialized");
    fetchData();

    // Connect Socket
    socketService.connect();

    // Initial check
    if (socketService.isConnected) {
      setSocketConnected(true);
    }

    // Join company room
    if (user?.companyId) {
      socketService.emit("join_room", {
        conversationId: `company:${user.companyId}`,
      });
    }

    const onConnect = () => {
      setSocketConnected(true);
      if (user?.companyId) {
        socketService.emit("join_room", {
          conversationId: `company:${user.companyId}`,
        });
      }
    };

    const onDisconnect = () => {
      setSocketConnected(false);
    };

    socketService.on("connect", onConnect);
    socketService.on("disconnect", onDisconnect);

    const handleConversationUpdated = (payload: any) => {
      setTickets((prev) => {
        // 🛡️ Robust Search: Find by ConvID OR ID (handling ghost tickets)
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

        // 🔔 PLAY SOUND if Inbound & Message Content exists
        const isOutbound =
          payload.senderType === "AGENT" || payload.direction === "OUTBOUND";
        if (
          !isOutbound &&
          (payload.lastMessage || payload.lastMessagePreview)
        ) {
          playNotificationSound();
        }

        if (ticketIndex === -1) {
          // ✨ OPTIMISTIC APPEND
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
            assignedToId: undefined, // Fix property name
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

        // 🔢 UNREAD COUNT LOGIC
        const isCurrentChatActive =
          currentActiveId === ticket.id ||
          currentActiveId === ticket.conversationId;
        const currentCount = Number(ticket.unreadCount) || 0;

        const newUnreadCount = isCurrentChatActive ? 0 : currentCount + 1;

        // 📝 LAST MESSAGE LOGIC
        let incomingMessage = "";
        if (typeof payload.lastMessage === "string") {
          incomingMessage = payload.lastMessage;
        } else if (payload.lastMessage?.content) {
          incomingMessage = payload.lastMessage.content;
        } else if (payload.lastMessagePreview) {
          incomingMessage = payload.lastMessagePreview;
        } else if (payload.content) {
          incomingMessage = payload.content;
        }

        const updatedLastMessage = incomingMessage || ticket.lastMessage;

        updatedTickets[ticketIndex] = {
          ...ticket,
          lastMessage: updatedLastMessage,
          lastMessageAt: payload.lastMessageAt || new Date().toISOString(),
          unreadCount: newUnreadCount,
          contact: {
            ...ticket.contact,
            ...(payload.contact || {}),
            name: resolvedName,
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
      "[AgentWorkspace] 📡 Registering conversation.updated listener",
    );
    socketService.on("conversation.updated", handleConversationUpdated);

    // Listener for Ticket Deletion
    const handleTicketDeleted = (data: { ticketId: string }) => {
      console.log("[AgentWorkspace] 🗑️ Ticket deleted:", data.ticketId);
      setTickets((prev) => prev.filter((t) => t.id !== data.ticketId));
      if (activeTicketIdRef.current === data.ticketId) {
        setActiveTicketId(null);
      }
    };
    socketService.on("ticket_deleted", handleTicketDeleted);

    console.log("[AgentWorkspace] ✅ Listeners registered");

    return () => {
      console.log("[AgentWorkspace] 🛑 Unmounting - Removing Listeners");
      socketService.off("conversation.updated", handleConversationUpdated);
      socketService.off("ticket_deleted", handleTicketDeleted);
    };
  }, [user?.companyId]); // Depend on user.companyId
};
