import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { Ticket, Contact, User, Tag, Channel } from "@/types";
import { getTickets } from "@/services/ticketService";
import { API_BASE_URL, BASE_URL } from "@/services/apiConfig";
import { resolveContactName } from "@/utils/contactUtils";
import { useAgentWorkspaceSockets } from "@/hooks/useAgentWorkspaceSockets";
import { useSocketStore } from "@/stores/socketStore";

// ────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────

export type WorkspaceTab = "my_chats" | "queue" | "resolved";
export type SortOrder = "date_desc" | "date_asc";
export type ViewMode = "compact" | "comfortable";

export interface UseAgentWorkspaceOptions {
  user?: User | null;
}

// ────────────────────────────────────────────────
// TICKET PROCESSING UTILITIES (Pure Functions)
// ────────────────────────────────────────────────

/** Deduplicates tickets by conversationId, keeping the most recent */
function deduplicateTickets(tickets: Ticket[]): Ticket[] {
  const map = new Map<string, Ticket>();
  tickets.forEach((ticket) => {
    const key = ticket.conversationId || ticket.id;
    if (!map.has(key)) {
      map.set(key, ticket);
    } else {
      const existing = map.get(key)!;
      const existingTime = new Date(existing.lastMessageAt || 0).getTime();
      const newTime = new Date(ticket.lastMessageAt || 0).getTime();
      if (newTime > existingTime) {
        map.set(key, ticket);
      }
    }
  });
  return Array.from(map.values());
}

/** Merges server tickets with protected local tickets (race condition guard) */
function mergeServerTickets(
  serverTickets: Ticket[],
  prevLocalTickets: Ticket[],
): Ticket[] {
  const serverTicketIds = new Set(serverTickets.map((t) => t.id));
  const serverConversationIds = new Set(
    serverTickets.map((t) => t.conversationId),
  );
  const now = Date.now();

  // Protect recent local tickets not yet in server
  const protectedLocalTickets = prevLocalTickets.filter((t) => {
    const isPresentById = serverTicketIds.has(t.id);
    const isPresentByConv =
      t.conversationId && serverConversationIds.has(t.conversationId);
    const isPresentDirect = serverConversationIds.has(t.id);
    const isMissing = !isPresentById && !isPresentByConv && !isPresentDirect;
    const lastActivity = new Date(t.lastMessageAt).getTime();
    const isRecent = now - lastActivity < 30000;
    return isMissing && isRecent;
  });

  // Sanitize server ticket names, preserving good local names
  const processedServerTickets = serverTickets.map((serverTicket) => {
    let cleanName = resolveContactName(
      serverTicket.contact as Partial<Contact>,
      serverTicket.subject || undefined,
    );

    const localTicket = prevLocalTickets.find(
      (t) =>
        t.id === serverTicket.id ||
        t.conversationId === serverTicket.conversationId ||
        t.id === serverTicket.conversationId,
    );

    const localName = localTicket?.contact?.name;
    const isServerFallback =
      cleanName === "Sin Nombre" || cleanName === "Usuario WhatsApp";
    const isLocalGood =
      localName &&
      localName !== "Sin Nombre" &&
      localName !== "Usuario WhatsApp";

    if (isLocalGood && isServerFallback) {
      cleanName = localName;
    }

    return {
      ...serverTicket,
      contact: {
        ...serverTicket.contact,
        name: cleanName,
        phone:
          serverTicket.contact.phone || localTicket?.contact?.phone || "",
        profilePicUrl:
          (serverTicket.contact.profilePicUrl?.startsWith("/")
            ? `${BASE_URL}${serverTicket.contact.profilePicUrl}`
            : serverTicket.contact.profilePicUrl) ||
          localTicket?.contact?.profilePicUrl,
        about: serverTicket.contact.about || localTicket?.contact?.about,
      },
    };
  });

  const finalTickets = [...protectedLocalTickets, ...processedServerTickets];
  finalTickets.sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() -
      new Date(a.lastMessageAt).getTime(),
  );
  return finalTickets;
}

/** Resolves a clean phone number from a ticket's contact data */
export function resolveContactPhone(ticket: Ticket): string {
  const raw =
    ticket.contact.phone ||
    ticket.contact.channelId ||
    ticket.conversationId ||
    "";

  const clean = String(raw)
    .replace("@s.whatsapp.net", "")
    .replace("@g.us", "")
    .replace(/:.*/, "")
    .replace(/\D/g, "");

  if (clean.startsWith("000")) return "";
  if (clean.startsWith("40000")) return "";
  if (clean.startsWith("45") && clean.length > 12) return "";
  if (clean.startsWith("40") && clean.length > 12) return "";
  if (clean.length >= 7 && clean.length <= 15) return `+${clean}`;
  return "";
}

/** Converts a Ticket to a Contact for the list component */
export function ticketToContact(ticket: Ticket): Contact {
  const displayName = resolveContactName(
    ticket.contact as Partial<Contact>,
    ticket.subject || undefined,
  );

  return {
    ...ticket.contact,
    name: displayName,
    id: ticket.id,
    realContactId: ticket.contact.id,
    avatarUrl: ticket.contact.avatarUrl || "",
    lastMessage: ticket.lastMessage,
    lastMessageTime: new Date(ticket.lastMessageAt),
    unreadCount: ticket.unreadCount,
    tags: ticket.tags,
    status: ticket.status,
    profilePicUrl: ticket.contact.profilePicUrl || undefined,
    about: ticket.contact.about || undefined,
    assignedMode: ticket.queueId === "ai" ? "bot" : "human",
    queueName: ticket.contact.queueName || ticket.queue?.name,
    assignedAgentName:
      ticket.contact.assignedAgentName || ticket.assignedTo?.name,
    channel: ticket.channel as Channel,
    isGroup: ticket.isGroup || ticket.contact.isGroup || false,
    whatsappSessionIndex: ticket.contact.whatsappSessionIndex,
    priority: ticket.priority,
    ticketId: ticket.id,
    ticketCreatedAt: ticket.createdAt,
  };
}

// ────────────────────────────────────────────────
// THE HOOK
// ────────────────────────────────────────────────

export function useAgentWorkspace({ user }: UseAgentWorkspaceOptions) {
  // ── Core State ──
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("my_chats");
  const [loading, setLoading] = useState(true);

  // ── Modal State ──
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferringTicketId, setTransferringTicketId] = useState<
    string | null
  >(null);

  // ── Filter State ──
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [filterUnread, setFilterUnread] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("date_desc");
  const [viewMode, setViewMode] = useState<ViewMode>("comfortable");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // ── UI State ──
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // ── Socket State (from centralized store) ──
  const socketConnected = useSocketStore((s) => s.isConnected);
  const socketEmit = useSocketStore((s) => s.emit);
  const socketInitialize = useSocketStore((s) => s.initialize);

  // ── Refs ──
  const activeTicketIdRef = useRef(activeTicketId);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep ref in sync
  useEffect(() => {
    activeTicketIdRef.current = activeTicketId;
  }, [activeTicketId]);

  // ── URL Deep Linking ──
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTicketId = searchParams.get("ticketId");

  useEffect(() => {
    if (queryTicketId && tickets.length > 0) {
      const found = tickets.find(
        (t) => t.id === queryTicketId || t.conversationId === queryTicketId,
      );
      if (found) {
        setActiveTicketId(found.id);
        if (found.assignedToId === user?.id) {
          setActiveTab("my_chats");
        } else if (found.status === "OPEN" && !found.assignedToId) {
          setActiveTab("queue");
        } else if (found.status === "CLOSED" || found.status === "RESOLVED") {
          setActiveTab("resolved");
        }
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("ticketId");
        setSearchParams(newParams);
      }
    }
  }, [queryTicketId, tickets, user, searchParams, setSearchParams]);

  // ────────────────────────────────────────────────
  // DATA FETCHING
  // ────────────────────────────────────────────────

  const fetchData = useCallback(
    (isBackground = false) => {
      if (!isBackground) {
        setLoading(true);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = setTimeout(() => setLoading(false), 20000);
      }
      socketEmit("session.check_status", {});

      getTickets()
        .then((allTickets) => {
          const safeTickets = Array.isArray(allTickets) ? allTickets : [];
          setTickets((prev) => {
            try {
              return mergeServerTickets(safeTickets, prev);
            } catch (e) {
              console.error("[Workspace] mergeServerTickets error", e);
              return prev;
            }
          });
          if (!isBackground) {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error("Error fetching tickets", err);
          if (!isBackground) {
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            setLoading(false);
          }
        });
    },
    [socketEmit],
  );

  const triggerBackgroundRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(() => {
      fetchData(true);
    }, 5000);
  }, [fetchData]);

  // ── Socket Store Initialization ──
  useEffect(() => {
    if (user) {
      socketInitialize(user.role, user.id, user.companyId);
    }
  }, [user?.id, user?.role, user?.companyId, socketInitialize]);

  // ── Socket Event Integration ──
  useAgentWorkspaceSockets({
    user,
    setTickets,
    activeTicketIdRef,
    setActiveTicketId,
    fetchData,
    triggerBackgroundRefresh,
  });

  // [CENTRALIZED] Socket connection polling and WhatsApp session status
  // are now managed by useSocketStore.initialize() — no local effects needed.

  // ── Load Tags ──
  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE_URL}/tags`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAllTags(data);
        else if (data && Array.isArray(data.data)) setAllTags(data.data);
        else setAllTags([]);
      })
      .catch((err) => console.error("Error loading tags", err));
  }, []);

  // ── Tab Title Management ──
  useEffect(() => {
    const totalUnread = tickets.reduce(
      (acc, t) => acc + (t.unreadCount || 0),
      0,
    );
    document.title = totalUnread > 0 ? `(${totalUnread}) Sentry CRM` : "Sentry CRM";
  }, [tickets]);

  // ────────────────────────────────────────────────
  // ACTION HANDLERS
  // ────────────────────────────────────────────────

  const handleSelectContact = useCallback((ticketId: string) => {
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === ticketId || ticket.conversationId === ticketId
          ? { ...ticket, unreadCount: 0 }
          : ticket,
      ),
    );
    setActiveTicketId(ticketId);
  }, []);

  const handleDeleteTicket = useCallback(
    async (ticketId: string) => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/tickets/${ticketId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Error al eliminar ticket");
        }
        setTickets((prev) => prev.filter((t) => t.id !== ticketId));
        if (activeTicketId === ticketId) {
          setActiveTicketId(null);
        }
        toast.success("Ticket eliminado");
      } catch (error: unknown) {
        const msg =
          error instanceof Error
            ? error.message
            : "Error al eliminar el ticket";
        toast.error(msg);
      }
    },
    [activeTicketId],
  );

  const handleOpenTransferModal = useCallback((ticketId: string) => {
    setTransferringTicketId(ticketId);
    setIsTransferModalOpen(true);
  }, []);

  const handleQueueTransfer = useCallback(
    async (targetId: string, type: "AGENT" | "QUEUE") => {
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
        if (!res.ok) throw new Error("Error al transferir el ticket");

        const json = await res.json();
        const updatedTicketData = json.data?.ticket || json;

        if (type === "AGENT") {
          setTickets((prev) =>
            prev.filter((t) => t.id !== transferringTicketId),
          );
          // [UX] If we transferred the active ticket, close the chat view
          const activeTicket = tickets.find(t => t.id === activeTicketId);
          if (
            activeTicketId === transferringTicketId || 
            activeTicket?.id === transferringTicketId ||
            activeTicket?.conversationId === transferringTicketId
          ) {
            setActiveTicketId(null);
          }
        } else {
          setTickets((prev) =>
            prev.map((t) =>
              t.id === transferringTicketId
                ? {
                    ...t,
                    ...updatedTicketData,
                    assignedToId: null,
                    status: "OPEN" as const,
                  }
                : t,
            ),
          );
          // [UX] If moved to queue, also deselect it from "My Chats"
          const activeTicket = tickets.find(t => t.id === activeTicketId);
          if (
            activeTicketId === transferringTicketId || 
            activeTicket?.id === transferringTicketId ||
            activeTicket?.conversationId === transferringTicketId
          ) {
            setActiveTicketId(null);
          }
        }

        toast.success(
          type === "AGENT"
            ? "Ticket transferido a agente"
            : "Ticket transferido a cola",
        );
        setIsTransferModalOpen(false);
        setTransferringTicketId(null);
      } catch (error: unknown) {
        const msg =
          error instanceof Error
            ? error.message
            : "Error al transferir el ticket";
        toast.error(msg);
      }
    },
    [transferringTicketId],
  );

  const handlePickTicket = useCallback(async () => {
    if (!activeTicketId || !user) return;
    const cleanId = activeTicketId.trim();
    const ticketToUpdate = tickets.find((t) => t.id === cleanId);
    if (!ticketToUpdate) return;

    try {
      const token = localStorage.getItem("token");
      let response = await fetch(`${API_BASE_URL}/tickets/${cleanId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "OPEN", assignedToId: user.id }),
      });

      // Self-healing for optimistic IDs (404)
      if (response.status === 404) {
        await new Promise<void>((resolve) => {
          getTickets()
            .then((realTickets) => {
              const ticketConvId =
                ticketToUpdate.conversationId || ticketToUpdate.id;
              const realTicket = realTickets.find(
                (t) => t.conversationId === ticketConvId,
              );
              if (realTicket && realTicket.id !== cleanId) {
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
                  response = retryRes;
                  resolve();
                });
              } else {
                resolve();
              }
            })
            .catch(() => resolve());
        });
      }

      if (!response.ok) {
        throw new Error("Error al asignar ticket (Posiblemente ya no existe)");
      }

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
      setActiveTab("my_chats");
      toast.success("Ticket asignado");
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Error al atender ticket";
      toast.error(msg);
      fetchData();
    }
  }, [activeTicketId, user, tickets, fetchData]);

  const handleCreateChatSubmit = useCallback(
    async (
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
        fetchData();
      } catch (error: unknown) {
        const msg =
          error instanceof Error ? error.message : "Error al iniciar chat";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [fetchData],
  );

  const handleOptimisticTicketUpdate = useCallback(
    (ticketId: string, updates: Partial<Ticket>) => {
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id === ticketId || t.conversationId === ticketId) {
            return {
              ...t,
              ...updates,
              contact: { ...t.contact, ...(updates.contact || {}) },
            };
          }
          return t;
        }),
      );
    },
    [],
  );

  const handleResolve = useCallback(
    async (category: string) => {
      if (!activeTicketId) return;
      try {
        const { resolveTicket } = await import("@/services/ticketService");
        await resolveTicket(activeTicketId, {
          status: "RESOLVED",
          resolutionType: category as "SALE" | "SUPPORT" | "ADMIN" | "OTHER" | "SPAM",
        });
        setTickets((prev) =>
          prev.map((t) =>
            t.id === activeTicketId ? { ...t, status: "RESOLVED" } : t,
          ),
        );
        setActiveTicketId(null);
        toast.success("Ticket resuelto");
      } catch {
        toast.error("Error al resolver ticket");
      }
    },
    [activeTicketId],
  );

  const handleContactUpdate = useCallback((updatedContact: Contact) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === updatedContact.id ||
        t.conversationId === updatedContact.id ||
        t.contact.id === updatedContact.id ||
        t.contact.realContactId === updatedContact.id
          ? { 
              ...t, 
              tags: updatedContact.tags !== undefined ? updatedContact.tags : t.tags,
              contact: { ...t.contact, ...updatedContact } 
            }
          : t,
      ),
    );
  }, []);

  const handleToggleTag = useCallback((tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  }, []);

  // ────────────────────────────────────────────────
  // DERIVED STATE (Memoized for performance)
  // ────────────────────────────────────────────────

  const currentUserId = user?.id;
  const isAdminRole = useMemo(
    () => ["ADMIN", "SUPERVISOR", "MASTER"].includes(user?.role || ""),
    [user?.role],
  );
  const isRestricted = useMemo(
    () => user?.companyStatus === "INACTIVE" || user?.companyStatus === "CANCELED",
    [user?.companyStatus],
  );

  const curatedTickets = useMemo(() => deduplicateTickets(tickets), [tickets]);

  const myTickets = useMemo(
    () =>
      curatedTickets.filter(
        (t) =>
          currentUserId &&
          t.assignedToId === currentUserId &&
          (t.status === "OPEN" || t.status === "IN_PROGRESS"),
      ),
    [curatedTickets, currentUserId],
  );

  const queueTickets = useMemo(
    () =>
      curatedTickets.filter(
        (t) =>
          t.status === "OPEN" &&
          !t.assignedToId &&
          !t.isGroup &&
          !t.contact?.isGroup,
      ),
    [curatedTickets],
  );

  // Build displayedTickets based on active tab, filters, and sort
  const displayedTickets = useMemo(() => {
    let result: Ticket[] = [];
    if (activeTab === "my_chats") {
      result = myTickets.filter(
        (t) => t.status !== "CLOSED" && t.status !== "RESOLVED",
      );

      // [SEC] Admin Empowerment: Include ALL active groups
      if (isAdminRole) {
        const allActiveGroupTickets = curatedTickets.filter(
          (t) =>
            (t.isGroup || t.contact?.isGroup) &&
            t.status !== "CLOSED" &&
            t.status !== "RESOLVED" &&
            !result.some((dt) => dt.id === t.id),
        );
        result = [...result, ...allActiveGroupTickets];
      }
    } else if (activeTab === "queue") {
      result = queueTickets.filter(
        (t) => t.status !== "CLOSED" && t.status !== "RESOLVED",
      );
    } else if (activeTab === "resolved") {
      if (isAdminRole) {
        result = tickets.filter(
          (t) => t.status === "CLOSED" || t.status === "RESOLVED",
        );
      } else {
        result = tickets.filter(
          (t) =>
            (t.status === "CLOSED" || t.status === "RESOLVED") &&
            t.assignedToId === currentUserId,
        );
      }
    }

    // Apply filters
    if (filterUnread) {
      result = result.filter((t) => t.unreadCount > 0);
    }
    if (selectedTags.length > 0) {
      result = result.filter((t) => {
        if (!t.tags || t.tags.length === 0) return false;
        return selectedTags.every((tagId) => t.tags.includes(tagId));
      });
    }

    // Sort (create new array to avoid mutation)
    return [...result].sort((a, b) => {
      const dateA = new Date(a.lastMessageAt).getTime();
      const dateB = new Date(b.lastMessageAt).getTime();
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;
      return sortOrder === "date_desc" ? dateB - dateA : dateA - dateB;
    });
  }, [
    activeTab, myTickets, queueTickets, curatedTickets, tickets,
    isAdminRole, currentUserId, filterUnread, selectedTags, sortOrder,
  ]);

  // Convert to contacts (memoized)
  const contacts = useMemo(
    () => displayedTickets.map(ticketToContact),
    [displayedTickets],
  );

  // Group handling (memoized)
  const { directContacts, groupContacts } = useMemo(() => {
    if (activeTab !== "my_chats") {
      return { directContacts: contacts, groupContacts: [] as Contact[] };
    }

    const direct = contacts.filter((c) => !c.isGroup);
    let groups: Contact[];
    if (isAdminRole) {
      const allActiveGroupTickets = curatedTickets.filter(
        (t) =>
          (t.isGroup || t.contact?.isGroup) &&
          t.status !== "CLOSED" &&
          t.status !== "RESOLVED",
      );
      groups = allActiveGroupTickets.map(ticketToContact);
    } else {
      groups = contacts.filter((c) => c.isGroup);
    }
    return { directContacts: direct, groupContacts: groups };
  }, [activeTab, contacts, isAdminRole, curatedTickets]);

  // Active ticket/contact resolution (memoized)
  const activeTicket = useMemo(
    () =>
      displayedTickets.find(
        (t) => t.id === activeTicketId || t.conversationId === activeTicketId,
      ),
    [displayedTickets, activeTicketId],
  );

  const activeContact: Contact | null = useMemo(
    () =>
      activeTicket
        ? {
            ...activeTicket.contact,
            name: resolveContactName(
              activeTicket.contact as Partial<Contact>,
              activeTicket.subject || undefined,
            ),
            id: activeTicket.conversationId || activeTicket.id,
            lastMessage: activeTicket.lastMessage,
            lastMessageTime: new Date(activeTicket.lastMessageAt),
            tags: activeTicket.tags,
            unreadCount: activeTicket.unreadCount,
            channel: activeTicket.channel as Channel,
            phone: resolveContactPhone(activeTicket),
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
            assignedToId: activeTicket.assignedToId,
            isGroup:
              activeTicket.isGroup || activeTicket.contact.isGroup || false,
            priority: activeTicket.priority,
            ticketId: activeTicket.id,
            ticketCreatedAt: activeTicket.createdAt,
          }
        : null,
    [activeTicket],
  );

  // Resolved today count (memoized)
  const resolvedTodayCount = useMemo(
    () =>
      tickets.filter(
        (t) =>
          (t.status === "CLOSED" || t.status === "RESOLVED") &&
          t.resolvedAt &&
          new Date(t.resolvedAt).toDateString() === new Date().toDateString(),
      ).length,
    [tickets],
  );

  return {
    // Core state
    tickets,
    activeTicketId,
    activeTab,
    loading,
    socketConnected,
    isSidebarOpen,

    // Modal state
    isNewChatModalOpen,
    isTransferModalOpen,
    transferringTicketId,

    // Filter state
    allTags,
    filterUnread,
    sortOrder,
    viewMode,
    selectedTags,

    // Derived state
    myTickets,
    queueTickets,
    displayedTickets,
    directContacts,
    groupContacts,
    activeTicket,
    activeContact,
    isAdminRole,
    isRestricted,
    resolvedTodayCount,

    // Setters
    setActiveTicketId,
    setActiveTab,
    setIsSidebarOpen,
    setIsNewChatModalOpen,
    setIsTransferModalOpen,
    setFilterUnread,
    setSortOrder,
    setViewMode,

    // Handlers
    handleSelectContact,
    handleDeleteTicket,
    handleOpenTransferModal,
    handleQueueTransfer,
    handlePickTicket,
    handleCreateChatSubmit,
    handleOptimisticTicketUpdate,
    handleResolve,
    handleContactUpdate,
    handleToggleTag,
    fetchData,
  };
}
