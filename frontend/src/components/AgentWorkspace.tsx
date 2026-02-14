import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import {
  Inbox,
  Layers,
  Menu,
  ChevronLeft,
  ChevronRight,
  Radio,
  User as UserIcon,
  Clock,
  MessageSquare,
  Phone,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle,
  Archive,
  Headphones,
  Activity,
  TrendingUp,
  Zap,
  RefreshCw,
} from "lucide-react";
import { Ticket, Contact, AIConfig, User, Tag, Channel } from "@/types";
import { getTickets, updateTicket } from "@/services/ticketService";
import { ContactList } from "./ContactList";
import { ChatInterface } from "./ChatInterface";
import { NewChatModal } from "./NewChatModal";
import { SyncMessagesModal } from "./SyncMessagesModal";
import { TransferModal } from "./TransferModal";
import { QueueView } from "./QueueView";
import { ResolvedView } from "./ResolvedView";
import { API_BASE_URL, BASE_URL } from "@/services/apiConfig";

import { resolveContactName, getInitials } from "@/utils/contactUtils";
import { useAgentWorkspaceSockets } from "@/hooks/useAgentWorkspaceSockets";
import { socketService } from "@/services/socketService";

interface Props {
  aiConfig: AIConfig;
  user?: User | null;
}

export const AgentWorkspace: React.FC<Props> = ({ aiConfig, user }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"my_chats" | "queue" | "resolved">(
    "my_chats",
  );
  const [loading, setLoading] = useState(true);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  // ?? ENTERPRISE: Queue Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferringTicketId, setTransferringTicketId] = useState<
    string | null
  >(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);

  const [filterUnread, setFilterUnread] = useState(false);
  const [sortOrder, setSortOrder] = useState<"date_desc" | "date_asc">(
    "date_desc",
  );
  const [viewMode, setViewMode] = useState<"compact" | "comfortable">(
    "comfortable",
  );
  // ??? ENTERPRISE: Tag Filtering State
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);

  // ? FIX: Use a Ref to track activeTicketId without triggering useEffect re-runs
  const activeTicketIdRef = useRef(activeTicketId);

  // Keep activeTicketIdRef in sync with state
  useEffect(() => {
    activeTicketIdRef.current = activeTicketId;
  }, [activeTicketId]);

  // ?? URL DEEP LINKING: Handle ?ticketId=xyz
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTicketId = searchParams.get("ticketId");

  useEffect(() => {
    if (queryTicketId && tickets.length > 0) {
      // Find ticket by ID or Conversation ID
      const found = tickets.find(
        (t) => t.id === queryTicketId || t.conversationId === queryTicketId,
      );

      if (found) {
        console.log(`[AgentWorkspace] ?? Deep linking to ticket: ${found.id}`);
        setActiveTicketId(found.id);

        // Smart Tab Switching
        if (found.assignedToId === user?.id) {
          setActiveTab("my_chats");
        } else if (found.status === "OPEN" && !found.assignedToId) {
          setActiveTab("queue");
        } else if (found.status === "CLOSED" || found.status === "RESOLVED") {
          setActiveTab("resolved");
        }

        // Clear param to keep URL clean
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("ticketId");
        setSearchParams(newParams);
      }
    }
  }, [queryTicketId, tickets, user, searchParams, setSearchParams]);

  // ? FIX: Debounced refresh to avoid overwriting optimistic updates immediately with stale data
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerBackgroundRefresh = () => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => {
      console.log("[AgentWorkspace] ?? Triggering background refresh...");
      fetchData(true); // Silent refresh
    }, 2000); // Wait 2 seconds before refreshing
  };

  // ?? HANDLE CONTACT SELECTION (Reset Unread Count)
  const handleSelectContact = (ticketId: string) => {
    console.log("[AgentWorkspace] ?? Opening chat:", ticketId);

    // Reset unread count for this ticket
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === ticketId || ticket.conversationId === ticketId
          ? { ...ticket, unreadCount: 0 }
          : ticket,
      ),
    );

    // Set as active
    setActiveTicketId(ticketId);
  };

  // Fetch Data
  const fetchData = (isBackground = false) => {
    if (!isBackground) setLoading(true);

    // ?? FORCE STATUS CHECK: Immediate feedback on connection status
    // useful when user clicks "refresh" button
    socketService.emit("session.check_status", {});

    getTickets()
      .then((allTickets) => {
        // DEBUG: Inspect Raw Data for specific ticket
        const debugT = allTickets.find(
          (t) => t.subject?.includes("AB") || t.contact?.name?.includes("AB"),
        );
        if (debugT) {
          console.log("[DEBUG TARGET] Ticket found:", {
            id: debugT.id,
            contactName: debugT.contact.name,
            contactPhone: debugT.contact.phone,
            contactChannelId: debugT.contact.channelId,
            conversationId: debugT.conversationId,
            subject: debugT.subject,
          });
        }

        setTickets((prevLocalTickets) => {
          // RACE CONDITION PROTECTION:
          // If a local ticket is very recent (updates in last 10s) but not yet in server list, KEEP IT.
          // This prevents "flickering" where a socket event adds a ticket, but the subsequent fetch removes it because DB wasn't ready.
          const serverTicketIds = new Set(allTickets.map((t) => t.id));
          const serverConversationIds = new Set(
            allTickets.map((t) => t.conversationId),
          );
          const now = Date.now();

          const protectedLocalTickets = prevLocalTickets.filter((t) => {
            // Check if ticket exists by ID OR by Conversation ID
            const isPresentById = serverTicketIds.has(t.id);
            const isPresentByConv =
              t.conversationId && serverConversationIds.has(t.conversationId);
            const isPresentDirect = serverConversationIds.has(t.id); // In case t.id is the convId (optimistic)

            const isMissing =
              !isPresentById && !isPresentByConv && !isPresentDirect;

            const lastActivity = new Date(t.lastMessageAt).getTime();
            const isRecent = now - lastActivity < 10000; // 10 seconds grace period
            return isMissing && isRecent;
          });

          if (protectedLocalTickets.length > 0) {
            console.log(
              `[AgentWorkspace] ??? Protected ${protectedLocalTickets.length} recent tickets from being overwritten`,
            );
          }

          const processedServerTickets = allTickets.map((serverTicket) => {
            // 1. Proactively Sanitize Server Ticket Name
            let cleanName = resolveContactName(
              serverTicket.contact as Partial<Contact>,
              serverTicket.subject || undefined,
            );

            // 2. Check Local State for better name (Match by ID or ConversationID)
            const localTicket = prevLocalTickets.find(
              (t) =>
                t.id === serverTicket.id ||
                t.conversationId === serverTicket.conversationId ||
                t.id === serverTicket.conversationId,
            );

            const localName = localTicket?.contact?.name;

            // Specific Logic: If Server says "Sin Nombre" or "Usuario WhatsApp" but Local has a Real Name, keep Local
            const isServerFallback =
              cleanName === "Sin Nombre" || cleanName === "Usuario WhatsApp";
            const isLocalGood =
              localName &&
              localName !== "Sin Nombre" &&
              localName !== "Usuario WhatsApp";

            if (isLocalGood && isServerFallback) {
              cleanName = localName;
            }

            // Mutate server ticket contact - PRESERVE ALL FIELDS
            return {
              ...serverTicket,
              contact: {
                ...serverTicket.contact, // ? Keep ALL fields from server
                name: cleanName,
                phone:
                  serverTicket.contact.phone ||
                  localTicket?.contact?.phone ||
                  "",
                // ? Explicitly preserve profile info
                profilePicUrl:
                  (serverTicket.contact.profilePicUrl?.startsWith("/")
                    ? `${BASE_URL}${serverTicket.contact.profilePicUrl}`
                    : serverTicket.contact.profilePicUrl) ||
                  localTicket?.contact?.profilePicUrl,
                about:
                  serverTicket.contact.about || localTicket?.contact?.about,
              },
            };
          });

          // Merge and Sort
          const finalTickets = [
            ...protectedLocalTickets,
            ...processedServerTickets,
          ];
          finalTickets.sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() -
              new Date(a.lastMessageAt).getTime(),
          );

          return finalTickets;
        });

        if (!isBackground) setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching tickets", err);
        if (!isBackground) setLoading(false);
      });
  };

  // ? Socket & Lifecycle Effect
  // ?? SOCKETS HOOK
  useAgentWorkspaceSockets({
    user,
    setTickets,
    activeTicketIdRef, // Pass the ref, not the value
    setSocketConnected,
    setActiveTicketId,
    fetchData,
    triggerBackgroundRefresh,
  });

  // ??? 100-YEAR FIX: Real-time WhatsApp Status Synchronization
  // Listens to 'session.status' event emitted by backend when WhatsApp connects/disconnects
  useEffect(() => {
    // Handler for status updates
    // Handler for status updates
    const handleSessionStatus = (data: {
      sessionId: string;
      status: string;
    }) => {
      console.log("[AgentWorkspace] ?? WhatsApp Status Update:", data.status);
      // ??? FIX: Update UI to reflect WhatsApp status immediately
      setSocketConnected(data.status === "CONNECTED");
    };

    // Handler for QR updates (implies unexpected disconnection or new session)
    const handleQrUpdated = () => {
      console.log("[AgentWorkspace] ?? QR Code received");
      // ??? FIX: Show as disconnected/offline when QR appears (session lost)
      setSocketConnected(false);
    };

    // Register listeners
    socketService.on("session.status", handleSessionStatus);
    socketService.on("qr.updated", handleQrUpdated);

    // Request initial status check if needed (backend syncs on connect, but good to be sure)
    // Request initial status check (backend syncs on connect, but good to be sure)
    socketService.emit("session.check_status", {});

    return () => {
      // Cleanup
      socketService.off("session.status", handleSessionStatus);
      socketService.off("qr.updated", handleQrUpdated);
    };
  }, []);

  useEffect(() => {
    // Load Tags
    const token = localStorage.getItem("token");
    fetch(`${API_BASE_URL}/tags`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setAllTags(data) : setAllTags([])))
      .catch((err) => console.error("Error loading tags", err));
  }, []);

  // ??? TAB TITLE MANAGEMENT (Must be Top Level Hook)
  useEffect(() => {
    const totalUnread = tickets.reduce(
      (acc, t) => acc + (t.unreadCount || 0),
      0,
    );
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) Reply CRM`;
    } else {
      document.title = "Reply CRM";
    }
  }, [tickets]);
  const handleDeleteTicket = async (ticketId: string) => {
    console.log("[AgentWorkspace] ??? Deleting ticket:", ticketId);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Error al eliminar ticket");
      }

      console.log("[AgentWorkspace] ? Ticket deleted successfully");

      // Remove ticket from state
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));

      // If it was the active ticket, clear selection
      if (activeTicketId === ticketId) {
        setActiveTicketId(null);
      }

      toast.success("Ticket eliminado correctamente");
    } catch (error: unknown) {
      console.error("[AgentWorkspace] ? Error deleting ticket:", error);
      const msg =
        error instanceof Error ? error.message : "Error al eliminar el ticket";
      toast.error(msg);
    }
  };

  // ?? ENTERPRISE: Queue Transfer Handlers
  const handleOpenTransferModal = (ticketId: string) => {
    setTransferringTicketId(ticketId);
    setIsTransferModalOpen(true);
  };

  const handleQueueTransfer = async (
    targetId: string,
    type: "AGENT" | "QUEUE",
  ) => {
    if (!transferringTicketId) return;

    try {
      const token = localStorage.getItem("token");
      const updateData =
        type === "AGENT"
          ? { assignedToId: targetId, status: "IN_PROGRESS" }
          : { queueId: targetId, assignedToId: null, status: "OPEN" };

      const res = await fetch(
        `${API_BASE_URL}/tickets/${transferringTicketId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updateData),
        },
      );

      if (!res.ok) {
        throw new Error("Error al transferir el ticket");
      }

      const json = await res.json();
      const updatedTicketData = json.data?.ticket || json; // Robust fallback

      // ??? 100-YEAR ENTERPRISE FIX: Smart State Update Based on Transfer Type
      if (type === "AGENT") {
        // TRANSFER TO AGENT: The ticket now belongs to someone else.
        // Remove it from the current agent's view IMMEDIATELY.
        // The new assignee will receive it via socket event.
        setTickets((prev) => prev.filter((t) => t.id !== transferringTicketId));
        console.log(
          "[AgentWorkspace] ?? Ticket transferred to agent. Removed from local view.",
          transferringTicketId,
        );
      } else {
        // TRANSFER TO QUEUE: The ticket is now unassigned.
        // Update local state so it moves from "My Chats" to "Queue".
        setTickets((prev) =>
          prev.map((t) =>
            t.id === transferringTicketId
              ? {
                  ...t,
                  ...updatedTicketData,
                  assignedToId: null, // Force NULL to ensure queue visibility
                  status: "OPEN" as const,
                }
              : t,
          ),
        );
        console.log(
          "[AgentWorkspace] ?? Ticket moved to queue. Updated local state.",
          transferringTicketId,
        );
      }

      toast.success(
        type === "AGENT"
          ? "Ticket asignado al agente correctamente"
          : "Ticket movido a la cola correctamente",
      );

      // Close modal and reset state
      setIsTransferModalOpen(false);
      setTransferringTicketId(null);
    } catch (error: unknown) {
      console.error("[AgentWorkspace] ? Error transferring ticket:", error);
      const msg =
        error instanceof Error
          ? error.message
          : "Error al transferir el ticket";
      toast.error(msg);
    }
  };

  // Filter Logic
  // ?? CRITICAL FIX: My Chats MUST only show tickets assigned to the current user
  // This ensures that when a ticket is transferred, it disappears from the original agent's view
  // ?? CRITICAL FIX: Deduplication Logic (100-Year Solution)
  // Ensure we NEVER show duplicate tickets for the same conversation
  // Or phantom duplicates with same message content but different IDs
  const uniqueTicketsMap = new Map<string, Ticket>();

  tickets.forEach((ticket) => {
    // Key by conversationId (primary) or fall back to ticket.id
    // This merges duplicates into a single entry
    const key = ticket.conversationId || ticket.id;

    if (!uniqueTicketsMap.has(key)) {
      uniqueTicketsMap.set(key, ticket);
    } else {
      // If duplicate exists, keep the one with the most recent activity
      const existing = uniqueTicketsMap.get(key)!;
      const existingTime = new Date(existing.lastMessageAt || 0).getTime();
      const newTime = new Date(ticket.lastMessageAt || 0).getTime();

      if (newTime > existingTime) {
        uniqueTicketsMap.set(key, ticket);
      }
    }
  });

  const curatedTickets = Array.from(uniqueTicketsMap.values());

  const currentUserId = user?.id;

  const myTickets = curatedTickets.filter((t) => {
    // Must be assigned to current user
    if (!currentUserId || t.assignedToId !== currentUserId) {
      return false;
    }
    // And must be active (not closed/resolved)
    return t.status === "OPEN" || t.status === "IN_PROGRESS";
  });

  // ??? 100-YEAR ENTERPRISE: Queue Visibility
  // Requirements:
  // - ONLY tickets that are OPEN AND have NO assignedToId (unassigned)
  // - EXCLUDE GROUPS (User Request: "no le debe salir los grupos a los agentes en 'cola de espera'")
  // - Future: Filter by queues the agent has access to (for multi-department orgs)
  const queueTickets = curatedTickets.filter((t) => {
    // Must be OPEN and UNASSIGNED
    if (t.status !== "OPEN" || t.assignedToId) {
      return false;
    }

    // ?? EXCLUDE GROUPS
    // Groups are handled separately or directly by assigned agents, not in the general queue
    if (t.isGroup || t.contact?.isGroup) {
      return false;
    }

    // TODO: Add queue-based access control here if needed
    // Example: return userQueueIds.includes(t.queueId) || !t.queueId;
    return true;
  });

  // Select Source
  let displayedTickets: Ticket[] = [];

  if (activeTab === "my_chats") {
    displayedTickets = myTickets.filter(
      (t) => t.status !== "CLOSED" && t.status !== "RESOLVED",
    );
  } else if (activeTab === "queue") {
    displayedTickets = queueTickets.filter(
      (t) => t.status !== "CLOSED" && t.status !== "RESOLVED",
    );
  } else if (activeTab === "resolved") {
    // ??? 100-YEAR ENTERPRISE: Role-aware Resolved View
    const isAdminOrSupervisor = ["ADMIN", "SUPERVISOR", "MASTER"].includes(
      user?.role || "",
    );

    if (isAdminOrSupervisor) {
      // Admins see ALL resolved tickets for the company
      displayedTickets = tickets.filter(
        (t) => t.status === "CLOSED" || t.status === "RESOLVED",
      );
    } else {
      // Agents only see THEIR resolved tickets (tickets they handled)
      displayedTickets = tickets.filter(
        (t) =>
          (t.status === "CLOSED" || t.status === "RESOLVED") &&
          t.assignedToId === currentUserId,
      );
    }
  }

  if (filterUnread) {
    displayedTickets = displayedTickets.filter((t) => t.unreadCount > 0);
  }

  // ??? ENTERPRISE: Advanced Tag Filtering
  // Only show tickets that contain ALL selected tags (AND logic) or ANY (OR logic)?
  // Usually "OR" is better for discovery, "AND" for strict narrowing.
  // Let's go with "AND" for precise filtering (Enterprise standard).
  if (selectedTags.length > 0) {
    displayedTickets = displayedTickets.filter((t) => {
      if (!t.tags || t.tags.length === 0) return false;
      // Check if ticket tags include ALL selected tags
      return selectedTags.every((tagId) => t.tags.includes(tagId));
    });
  }

  // Apply Sort
  displayedTickets.sort((a, b) => {
    const dateA = new Date(a.lastMessageAt).getTime();
    const dateB = new Date(b.lastMessageAt).getTime();
    if (isNaN(dateA)) return 1; // Push invalid dates to bottom
    if (isNaN(dateB)) return -1;
    return sortOrder === "date_desc" ? dateB - dateA : dateA - dateB;
  });

  // Convert to Contact format for the List Component
  const contacts: Contact[] = displayedTickets.map((t) => {
    const displayName = resolveContactName(
      t.contact as Partial<Contact>,
      t.subject || undefined,
    ); // Use Subject as Fallback!

    return {
      ...t.contact,
      name: displayName, // Apply sanitized name
      id: t.id, // Use Ticket ID for selection logic to work
      realContactId: t.contact.id, // Preserve original Contact ID
      avatarUrl: t.contact.avatarUrl || "", // ? Fallback for required field
      lastMessage: t.lastMessage,
      lastMessageTime: new Date(t.lastMessageAt),
      unreadCount: t.unreadCount,
      tags: t.tags,
      // channel duplicate removed
      status: t.status,
      profilePicUrl: t.contact.profilePicUrl || undefined, // Fix null vs undefined mismatch
      about: t.contact.about || undefined, // Fix null vs undefined mismatch
      assignedMode: t.queueId === "ai" ? "bot" : "human",
      queueName: t.contact.queueName || t.queue?.name,
      assignedAgentName: t.contact.assignedAgentName || t.assignedTo?.name,
      channel: t.channel as Channel,
      // ?? GROUP CHAT SUPPORT
      isGroup: t.isGroup ?? t.contact.isGroup ?? false,
      // ?? Multi-WhatsApp Session Identification (#1, #2, #3)
      whatsappSessionIndex: t.contact.whatsappSessionIndex,
    };
  });

  // 100-Year Solution: Smart Grouping for Enterprise Workflow
  let directContacts = contacts;
  let groupContacts: Contact[] = [];

  if (activeTab === "my_chats") {
    directContacts = contacts.filter((c) => !c.isGroup);
    groupContacts = contacts.filter((c) => c.isGroup);
  }

  const activeTicket = tickets.find((t) => t.id === activeTicketId);

  const activeContact = activeTicket
    ? {
        ...activeTicket.contact,
        name: resolveContactName(
          activeTicket.contact as Partial<Contact>,
          activeTicket.subject || undefined,
        ),
        id: activeTicket.conversationId || activeTicket.id,
        // ? Map missing Contact fields from Ticket
        lastMessage: activeTicket.lastMessage,
        lastMessageTime: new Date(activeTicket.lastMessageAt),
        tags: activeTicket.tags,
        unreadCount: activeTicket.unreadCount,
        channel: activeTicket.channel as Channel,
        // SMART PHONE RESOLUTION (Robust Extraction - Evaluates ALL sources)
        phone: (() => {
          // 1. Get raw candidate (Phone OR ChannelId OR ConversationId)
          // We start fresh to ensure filters apply even if backend sent a "bad" phone match
          const raw =
            activeTicket.contact.phone ||
            activeTicket.contact.channelId ||
            activeTicket.conversationId ||
            "";

          // 2. Clean
          const clean = String(raw)
            .replace("@s.whatsapp.net", "")
            .replace("@g.us", "")
            .replace(/:.*/, "")
            .replace(/\D/g, "");

          // 3. STRICT BLACKLIST (Matches Backend + User Feedback)
          if (clean.startsWith("000")) return ""; // DB IDs
          if (clean.startsWith("40000")) return ""; // Virtual IDs

          // Special Check for Long LIDs (often start with 45 or 40 and length > 12)
          if (clean.startsWith("45") && clean.length > 12) return "";
          if (clean.startsWith("40") && clean.length > 12) return "";

          // 4. Relaxed Length Check (7-15)
          if (clean.length >= 7 && clean.length <= 15) return `+${clean}`;

          return "";
        })(),

        channelId: activeTicket.contact.channelId,
        avatarUrl: activeTicket.contact.avatarUrl || "",
        profilePicUrl: activeTicket.contact.profilePicUrl || undefined,
        about: activeTicket.contact.about || undefined,
        status: activeTicket.status,
        assignedMode: (activeTicket.queueId === "ai" ? "bot" : "human") as
          | "bot"
          | "human",
        queueName: activeTicket.queue?.name,
        assignedAgentName: activeTicket.assignedTo?.name,
        // ?? GROUP CHAT SUPPORT
        isGroup: activeTicket.isGroup ?? activeTicket.contact.isGroup ?? false,
      }
    : null;

  if (activeContact) {
    // Debug Socket Room ID
    // console.log(`[AgentWorkspace] ?? Active Contact ID for Socket: ${activeContact.id} (TicketID: ${activeTicket.id}, ConvID: ${activeTicket.conversationId})`);
  }

  // Actions
  const handlePickTicket = async () => {
    if (!activeTicketId || !user) return;

    // ??? DEBUG: deeply inspect ID
    console.log(
      `[handlePickTicket] Attempting to pick ID: '${activeTicketId}'`,
    );
    console.log(`[handlePickTicket] ID Length: ${activeTicketId.length}`);
    // Check for invisible chars
    for (let i = 0; i < activeTicketId.length; i++) {
      const code = activeTicketId.charCodeAt(i);
      if (code < 32 || code > 126)
        console.warn(`[handlePickTicket] ?? Suspicious char at ${i}: ${code}`);
    }

    const cleanId = activeTicketId.trim();

    const ticketToUpdate = tickets.find((t) => t.id === cleanId);
    if (!ticketToUpdate) {
      console.error("[handlePickTicket] Ticket not found in local state");
      return;
    }

    try {
      const token = localStorage.getItem("token");

      // 1. Assign ticket to current agent
      let response = await fetch(`${API_BASE_URL}/tickets/${cleanId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "OPEN",
          assignedToId: user.id,
        }),
      });

      // ??? 100-YEAR FIX: Self-Healing for Optimistic IDs (404 Handling)
      // If we get a 404, it likely means we used a ConversationID (optimistic) instead of the real TicketID.
      // We force a refresh, find the REAL ticket using the conversation ID, and retry.
      if (response.status === 404) {
        console.warn(
          "[handlePickTicket] ?? 404 encountered. ID might be optimistic. Attempting self-heal...",
        );

        // 1. Force Sync Fetch (wait for it)
        await new Promise<void>((resolve) => {
          // Manually trigger fetch logic here or wait for global fetch
          // For safety, we'll re-call the logic of getTickets here directly to avoid state hook delays
          getTickets()
            .then((realTickets) => {
              // 2. Find the REAL ticket via Conversation ID
              const ticketConvId =
                ticketToUpdate.conversationId || ticketToUpdate.id;
              const realTicket = realTickets.find(
                (t) => t.conversationId === ticketConvId,
              );

              if (realTicket && realTicket.id !== cleanId) {
                console.log(
                  `[handlePickTicket] ?? Healed ID: ${cleanId} -> ${realTicket.id}`,
                );
                // 3. Retry with Real ID
                fetch(`${API_BASE_URL}/tickets/${realTicket.id}`, {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    status: "OPEN",
                    assignedToId: user.id,
                  }),
                }).then((retryRes) => {
                  response = retryRes; // Update response ref
                  resolve();
                });
              } else {
                resolve(); // Could not heal
              }
            })
            .catch(() => resolve());
        });
      }

      if (!response.ok) {
        throw new Error("Error al asignar ticket (Posiblemente ya no existe)");
      }

      // 2. Send system notification to chat
      const conversationId = ticketToUpdate.conversationId || ticketToUpdate.id;
      await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: `????? El agente *${user.name}* se ha unido al chat`,
          senderType: "SYSTEM",
          direction: "OUTBOUND",
        }),
      });

      // 3. Optimistic UI Update
      setTickets((prev) =>
        prev.map((t) =>
          t.id === activeTicketId
            ? {
                ...t,
                status: "OPEN" as const,
                assignedToId: user.id,
                assignedTo: user,
              }
            : t,
        ),
      );

      // 4. Switch to My Chats view
      setActiveTab("my_chats");

      toast.success(`Ticket asignado. �Puedes comenzar a chatear!`);
    } catch (error: unknown) {
      console.error("Failed to pick ticket", error);
      const msg =
        error instanceof Error ? error.message : "Error al atender ticket";
      toast.error(msg);
      fetchData(); // Revert on error
    }
  };

  const handleNewChat = () => {
    setIsNewChatModalOpen(true);
  };

  const handleCreateChatSubmit = async (
    phone: string,
    name: string,
    message: string,
    addToContacts: boolean,
  ) => {
    setIsNewChatModalOpen(false);
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phone, name, message, addToContacts }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Error al crear chat");
      }

      // Refresh tickets/chats
      fetchData();
    } catch (error: unknown) {
      console.error("Error creating chat", error);
      const msg =
        error instanceof Error ? error.message : "Error al iniciar chat";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSubmit = async (dateStr: string) => {
    setIsSyncModalOpen(false);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/whatsapp/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fromDate: dateStr }),
      });
      const data = await res.json();
      toast.success(data.message || "Sincronizaci�n iniciada");
    } catch (e) {
      toast.error("Error al iniciar sincronizaci�n");
    }
  };

  const isRestricted =
    user?.companyStatus === "INACTIVE" || user?.companyStatus === "CANCELED";

  // ??? 100-YEAR FIX: Global Optimistic Update
  const handleOptimisticTicketUpdate = (ticketId: string, updates: any) => {
    console.log("[AgentWorkspace] ? Optimistic Update:", ticketId, updates);
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId || t.conversationId === ticketId) {
          return {
            ...t,
            ...updates,
            // Ensure contact object is preserved
            contact: {
              ...t.contact,
              ...(updates.contact || {}),
            },
          };
        }
        return t;
      }),
    );
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark">
      {/* Header */}
      {/* ?? ENTERPRISE HEADER */}
      <div className="px-4 md:px-6 py-3 md:py-4 bg-white/80 dark:bg-reply-surface-dark/95 backdrop-blur-xl border-b border-gray-200/60 dark:border-reply-border-dark sticky top-0 z-40 transition-all duration-300 shadow-sm relative">
        <div className="flex justify-between items-center max-w-full gap-4">
          {/* LEFT: Branding & Status */}
          <div className="flex items-center gap-2 md:gap-6">
            <div className="flex items-center gap-2 md:gap-3 group">
              <div
                className={`p-2 md:p-2.5 rounded-xl bg-gradient-to-br transition-all duration-500 ${socketConnected ? "from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20 group-hover:from-emerald-500/20 group-hover:to-teal-500/20" : "from-red-500/10 to-pink-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/20"}`}
              >
                <LayoutDashboard className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-sm md:text-lg font-bold text-gray-900 dark:text-white leading-tight tracking-tight font-display">
                  Panel de Agente
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="relative flex h-2 w-2">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${socketConnected ? "bg-emerald-400" : "bg-red-400"}`}
                    ></span>
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${socketConnected ? "bg-emerald-500" : "bg-red-500"}`}
                    ></span>
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {socketConnected ? "Online" : "Offline"}
                  </span>
                </div>
              </div>
            </div>

            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 hidden xl:block" />

            {/* Desktop Tabs - Segmented Control */}
            <div className="hidden xl:flex p-1 bg-gray-100/50 dark:bg-reply-panel-dark/50 rounded-xl border border-gray-200/50 dark:border-reply-border-dark/50 backdrop-blur-sm">
              {[
                {
                  id: "my_chats",
                  label: "Mis Chats",
                  count: myTickets.length,
                  icon: Inbox,
                  color: "indigo",
                },
                {
                  id: "queue",
                  label: "Colas",
                  count: queueTickets.length,
                  icon: Layers,
                  color: "orange",
                },
                {
                  id: "resolved",
                  label: "Resueltos",
                  count: tickets.filter(
                    (t) => t.status === "CLOSED" || t.status === "RESOLVED",
                  ).length,
                  icon: CheckCircle,
                  color: "green",
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as "my_chats" | "queue" | "resolved");
                    setActiveTicketId(null);
                  }}
                  className={`
                     relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ease-out
                     ${
                       activeTab === tab.id
                         ? "bg-white dark:bg-reply-border-dark text-gray-900 dark:text-white shadow-md shadow-gray-200/50 dark:shadow-none ring-1 ring-black/5 dark:ring-white/10 scale-100"
                         : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50"
                     }
                   `}
                >
                  {activeTab === tab.id && (
                    <span
                      className={`absolute left-0 w-1 h-3/4 bg-${tab.color}-500 rounded-r-full opacity-0 md:opacity-100 transition-opacity`}
                    ></span>
                  )}
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold shadow-sm ${
                        activeTab === tab.id
                          ? `bg-${tab.color}-100 text-${tab.color}-700 dark:bg-${tab.color}-500/20 dark:text-${tab.color}-300`
                          : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* CENTER: Agent Quick Stats (Hidden on mobile) */}
          <div className="hidden lg:flex items-center gap-4 flex-1 justify-center">
            {/* Active Chats Stat */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
              <Headphones className="w-4 h-4 text-indigo-500" />
              <div className="flex flex-col">
                <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  Activos
                </span>
                <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                  {myTickets.length}
                </span>
              </div>
            </div>

            {/* Queue Stat */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-800/30">
              <Activity className="w-4 h-4 text-orange-500" />
              <div className="flex flex-col">
                <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                  En Cola
                </span>
                <span className="text-sm font-bold text-orange-700 dark:text-orange-300">
                  {queueTickets.length}
                </span>
              </div>
            </div>

            {/* Resolved Today Stat */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800/30">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <div className="flex flex-col">
                <span className="text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">
                  Hoy
                </span>
                <span className="text-sm font-bold text-green-700 dark:text-green-300">
                  {
                    tickets.filter(
                      (t) =>
                        (t.status === "CLOSED" || t.status === "RESOLVED") &&
                        t.resolvedAt &&
                        new Date(t.resolvedAt).toDateString() ===
                          new Date().toDateString(),
                    ).length
                  }
                </span>
              </div>
            </div>

            {/* Refresh Button */}
            {/* Refresh Button Removed by User Request */}
          </div>

          {/* Portal for additional actions */}
          <div
            id="header-actions-portal"
            className="lg:hidden flex-1 flex justify-end items-center px-2 min-w-0"
          />

          {/* RIGHT: Tools */}
          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            {/* Mobile Tabs */}
            <div className="xl:hidden flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => {
                  setActiveTab("my_chats");
                  setActiveTicketId(null);
                }}
                className={`p-2 rounded-md transition-all ${activeTab === "my_chats" ? "bg-white dark:bg-gray-700 shadow text-indigo-600" : "text-gray-500"}`}
              >
                <Inbox className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setActiveTab("queue");
                  setActiveTicketId(null);
                }}
                className={`p-2 rounded-md transition-all ${activeTab === "queue" ? "bg-white dark:bg-gray-700 shadow text-orange-600" : "text-gray-500"}`}
              >
                <Layers className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setActiveTab("resolved");
                  setActiveTicketId(null);
                }}
                className={`p-2 rounded-md transition-all ${activeTab === "resolved" ? "bg-white dark:bg-gray-700 shadow text-green-600" : "text-gray-500"}`}
              >
                <CheckCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-1 hidden md:block" />

            {/* Agent Profile (Hidden on small screens) */}
            {user && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-reply-bg dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-reply-border-dark">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                  {user.name?.charAt(0).toUpperCase() || "A"}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[100px]">
                    {user.name || "Agente"}
                  </span>
                  <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {user.role === "ADMIN" ? "Admin" : "Agente"}
                  </span>
                </div>
              </div>
            )}

            {/* Sync Button (Disabled for now)
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="hidden md:flex p-2.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all border border-transparent hover:border-blue-100 dark:hover:border-blue-800"
              title="Sincronizar Historial de WhatsApp"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            */}

            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden md:flex group p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
              title={isSidebarOpen ? "Ocultar panel" : "Mostrar panel"}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-5 h-5 group-hover:scale-90 transition-transform" />
              ) : (
                <PanelLeftOpen className="w-5 h-5 group-hover:scale-110 transition-transform" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div
          className={`
                    border-r border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-surface-dark flex flex-col flex-shrink-0 z-20
                    ${
                      isSidebarOpen
                        ? `w-full md:w-72 ${activeTicketId ? "hidden md:flex" : "flex"}`
                        : "hidden"
                    }
                `}
        >
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              Cargando tickets...
            </div>
          ) : activeTab === "queue" ? (
            // ?? ENTERPRISE: Queue View with priority grouping + Manual Transfer
            <QueueView
              tickets={queueTickets}
              activeTicketId={activeTicketId}
              onSelectTicket={handleSelectContact}
              onTransferTicket={handleOpenTransferModal}
            />
          ) : activeTab === "resolved" ? (
            // ?? ENTERPRISE: Resolved View with history and metrics
            <ResolvedView
              tickets={tickets.filter(
                (t) => t.status === "CLOSED" || t.status === "RESOLVED",
              )}
              activeTicketId={activeTicketId}
              onSelectTicket={handleSelectContact}
            />
          ) : (
            // My Chats: Standard ContactList with Direct/Groups
            <ContactList
              contacts={directContacts}
              groups={groupContacts}
              activeContactId={activeTicketId || ""}
              onSelectContact={handleSelectContact}
              userRole={user?.role}
              onDeleteContact={handleDeleteTicket}
              onNewChat={isRestricted ? undefined : handleNewChat}
              // Menu Props
              filterUnread={filterUnread}
              onToggleFilterUnread={() => setFilterUnread(!filterUnread)}
              sortOrder={sortOrder}
              onChangeSortOrder={setSortOrder}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              allTags={allTags}
              // Tag Filtering
              selectedTags={selectedTags}
              onToggleTag={(tagId) => {
                setSelectedTags((prev) =>
                  prev.includes(tagId)
                    ? prev.filter((id) => id !== tagId)
                    : [...prev, tagId],
                );
              }}
            />
          )}
        </div>

        {/* Main: Chat Interface or Queue Preview */}
        <div
          className={`flex-1 bg-[#e5ddd5] dark:bg-reply-bg-dark relative flex flex-col min-w-0 ${!activeTicketId ? "hidden md:flex" : "flex"}`}
        >
          {activeTicket ? (
            activeTab === "my_chats" ? (
              // ACTIVE CHAT VIEW
              <ChatInterface
                activeContact={{
                  ...activeContact!,
                  ticketId: activeTicket?.id, // ??? CRITICAL FIX: Ensure Ticket ID is present for API calls
                }}
                aiConfig={aiConfig}
                readOnly={isRestricted}
                onBack={() => setActiveTicketId(null)}
                // ??? 100-YEAR FIX: Pass Optimistic Update Handler
                onTicketUpdate={handleOptimisticTicketUpdate}
              />
            ) : (
              // QUEUE PREVIEW VIEW (Pick Ticket) - Improved Design
              <div className="h-full flex flex-col items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-[#0b141a] dark:via-[#111b21] dark:to-[#0b141a]">
                <div className="bg-white dark:bg-reply-panel-dark p-6 sm:p-8 rounded-3xl shadow-2xl max-w-lg w-full border-2 border-gray-100 dark:border-reply-border-dark space-y-6">
                  {/* Header with Avatar */}
                  <div className="text-center pb-6 border-b border-gray-200 dark:border-reply-border-dark">
                    <div className="relative inline-block">
                      {activeTicket.contact.profilePicUrl ||
                      activeTicket.contact.avatarUrl ? (
                        <img
                          src={
                            activeTicket.contact.profilePicUrl ||
                            activeTicket.contact.avatarUrl
                          }
                          alt={activeTicket.contact.name}
                          className="w-24 h-24 rounded-full mx-auto border-4 border-white dark:border-gray-600 shadow-lg object-cover"
                        />
                      ) : (
                        <div className="w-24 h-24 rounded-full mx-auto border-4 border-white dark:border-gray-600 shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white text-3xl font-bold">
                            {activeTicket.contact.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      {/* Status Badge */}
                      <div className="absolute bottom-0 right-0 w-8 h-8 bg-orange-500 rounded-full border-4 border-white dark:border-reply-border-dark flex items-center justify-center shadow-sm">
                        <Clock className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-4">
                      {activeTicket.contact.name}
                    </h3>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        <MessageCircle className="w-3 h-3" />
                        {activeTicket.channel?.toUpperCase() || "WHATSAPP"}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                        <Clock className="w-3 h-3" />
                        EN COLA
                      </span>
                    </div>
                  </div>

                  {/* Message Preview */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        �ltimo Mensaje
                      </p>
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-[#111b21] dark:to-[#1a2730] p-4 rounded-xl border border-gray-200 dark:border-reply-border-dark">
                        <p className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed line-clamp-3">
                          {activeTicket.lastMessage || "Sin mensaje previo..."}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                          {new Date(activeTicket.lastMessageAt).toLocaleString(
                            "es-ES",
                            {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Quick Info */}
                    {activeTicket.contact.phone && (
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <Phone className="w-4 h-4" />
                        <span className="font-mono">
                          {activeTicket.contact.phone}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* CTA Button */}
                  {isRestricted ? (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm font-bold text-center border border-red-200 dark:border-red-800 flex items-center justify-center gap-2">
                      <AlertCircle className="w-6 h-6" />
                      Acci�n no disponible en modo restringido
                    </div>
                  ) : (
                    <button
                      onClick={handlePickTicket}
                      className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transform transition-all hover:scale-105 hover:shadow-xl active:scale-95 flex items-center justify-center gap-3 group"
                    >
                      <CheckCircle2 className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                      <span className="text-lg">TOMAR TICKET</span>
                    </button>
                  )}
                </div>
              </div>
            )
          ) : (
            // ?? ENTERPRISE: Enhanced Empty State
            <div className="h-full flex flex-col items-center justify-center p-10 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-[#0b141a] dark:via-[#111b21] dark:to-[#0b141a]">
              <div className="max-w-md w-full text-center">
                {/* Animated Icon */}
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 blur-3xl rounded-full" />
                  <div className="relative p-6 bg-white dark:bg-reply-panel-dark rounded-3xl shadow-xl border border-gray-100 dark:border-reply-border-dark">
                    {activeTab === "queue" ? (
                      <Layers className="w-16 h-16 text-orange-400" />
                    ) : activeTab === "resolved" ? (
                      <CheckCircle className="w-16 h-16 text-green-400" />
                    ) : (
                      <MessageCircle className="w-16 h-16 text-indigo-400" />
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
                  {activeTab === "queue"
                    ? "Cola de Espera"
                    : activeTab === "resolved"
                      ? "Historial de Tickets"
                      : "Selecciona una Conversaci�n"}
                </h3>

                {/* Description */}
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  {activeTab === "queue"
                    ? "Revisa los tickets pendientes y as�gnatelos para comenzar a atender."
                    : activeTab === "resolved"
                      ? "Consulta el historial de tickets resueltos y sus m�tricas."
                      : "Elige un chat de tu bandeja para comenzar a responder."}
                </p>

                {/* Quick Stats Summary */}
                <div className="flex justify-center gap-4 p-4 bg-reply-bg dark:bg-reply-panel-dark rounded-xl">
                  <div className="text-center px-4">
                    <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                      {myTickets.length}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                      Activos
                    </div>
                  </div>
                  <div className="w-px bg-gray-200 dark:bg-gray-700" />
                  <div className="text-center px-4">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {queueTickets.length}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                      En Cola
                    </div>
                  </div>
                  <div className="w-px bg-gray-200 dark:bg-gray-700" />
                  <div className="text-center px-4">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {
                        tickets.filter(
                          (t) =>
                            (t.status === "CLOSED" ||
                              t.status === "RESOLVED") &&
                            t.resolvedAt &&
                            new Date(t.resolvedAt).toDateString() ===
                              new Date().toDateString(),
                        ).length
                      }
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                      Resueltos Hoy
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <NewChatModal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        onSubmit={handleCreateChatSubmit}
      />
      <SyncMessagesModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSubmit={handleSyncSubmit}
      />
      {/* ?? ENTERPRISE: Queue Transfer Modal */}
      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setTransferringTicketId(null);
        }}
        onTransfer={handleQueueTransfer}
        currentUserId={user?.id}
      />
    </div>
  );
};
