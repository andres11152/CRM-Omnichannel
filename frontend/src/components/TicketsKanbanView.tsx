import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal, ModalButton } from "./ui/Modal";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Ticket, Agent } from "@/types";
import {
  getTickets,
  updateTicket,
} from "@/services/ticketService";
import { getAgents } from "@/services/queueService";
import { api } from "@/lib/axios";
import { Tag as TagType } from "@/types";
import {
  X,
  Eye,
  UserPlus,
  Clock,
  MessageSquare,
  Phone,
  ChevronRight,
  Tag,
  Hash,
  AlertTriangle,
  TrendingUp,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Avatar } from "@/components/common/Avatar";

// ─── STATUS COLUMN CONFIGURATION ───
const STATUS_COLUMNS = [
  {
    id: "OPEN",
    title: "Abierto",
    accent: "from-blue-500 to-blue-600",
    bg: "bg-blue-50 dark:bg-blue-900/10",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  {
    id: "IN_PROGRESS",
    title: "En Progreso",
    accent: "from-amber-500 to-yellow-500",
    bg: "bg-amber-50 dark:bg-amber-900/10",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  {
    id: "RESOLVED",
    title: "Resuelto",
    accent: "from-emerald-500 to-green-500",
    bg: "bg-emerald-50 dark:bg-emerald-900/10",
    badge:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  {
    id: "CLOSED",
    title: "Cerrado",
    accent: "from-gray-400 to-gray-500",
    bg: "bg-gray-50 dark:bg-gray-800/30",
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
    dot: "bg-gray-400",
  },
];

// ─── PRIORITY HELPERS ───
const PRIORITY_CONFIG: Record<
  string,
  { color: string; bg: string; label: string; order: number }
> = {
  CRITICAL: {
    color: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    label: "Crítico",
    order: 0,
  },
  HIGH: {
    color: "text-orange-700 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800",
    label: "Alta",
    order: 1,
  },
  MEDIUM: {
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    label: "Media",
    order: 2,
  },
  LOW: {
    color: "text-gray-600 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700",
    label: "Baja",
    order: 3,
  },
};

const getPriority = (p: string) =>
  PRIORITY_CONFIG[p?.toUpperCase()] || PRIORITY_CONFIG.MEDIUM;

const formatWaitTime = (dateStr: string): string => {
  const mins = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 60000,
  );
  if (mins < 0) return "0m";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d`;
};

// ─── CHANNEL ICON ───
const ChannelIcon: React.FC<{ channel: string; className?: string }> = ({
  channel,
  className = "w-3.5 h-3.5",
}) => {
  if (channel === "WhatsApp" || channel === "WHATSAPP") {
    return (
      <svg className={`${className} text-green-500`} fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
    );
  }
  return <MessageSquare className={`${className} text-gray-400`} />;
};

// ─── MAIN COMPONENT ───
interface Props {
  isWidget?: boolean;
}

export const TicketsKanbanView: React.FC<Props> = ({ isWidget = false }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const { t, i18n } = useTranslation();
  const [assigning, setAssigning] = useState<string | null>(null);
 
  const localizedColumns = useMemo(() => [
    { ...STATUS_COLUMNS[0], title: t("tickets_kanban.columns.open", "Abierto") },
    { ...STATUS_COLUMNS[1], title: t("tickets_kanban.columns.in_progress", "En Progreso") },
    { ...STATUS_COLUMNS[2], title: t("tickets_kanban.columns.resolved", "Resuelto") },
    { ...STATUS_COLUMNS[3], title: t("tickets_kanban.columns.closed", "Cerrado") },
  ], [t]);
 
  const getLocalizedPriority = (p: string) => {
    const config = PRIORITY_CONFIG[p?.toUpperCase()] || PRIORITY_CONFIG.MEDIUM;
    const labels: Record<string, string> = {
      CRITICAL: t("tickets_kanban.priorities.critical", "Crítico"),
      HIGH: t("tickets_kanban.priorities.high", "Alta"),
      MEDIUM: t("tickets_kanban.priorities.medium", "Media"),
      LOW: t("tickets_kanban.priorities.low", "Baja"),
    };
    return { ...config, label: labels[p?.toUpperCase()] || config.label };
  };

  useEffect(() => {
    fetchInitialData();
    fetchAllTags();
  }, []);

  const fetchAllTags = async () => {
    try {
      const res = await api.get("/tags");
      const data = res.data.data?.tags || res.data.data || res.data;
      if (Array.isArray(data)) {
        setAllTags(data);
      }
    } catch (e) {
      console.error("Failed to fetch tags", e);
    }
  };

  const fetchInitialData = async () => {
    await Promise.all([fetchTickets(), fetchAgents()]);
  };

  const fetchAgents = async () => {
    try {
      const data = await getAgents();
      setAgents(data);
    } catch (error) {
      console.error("[Kanban] Failed to load agents", error);
    }
  };

  const fetchTickets = async () => {
    try {
      const data = await getTickets();
      if (Array.isArray(data)) setTickets(data);
    } catch (error) {
      console.error("[Kanban] Failed to load tickets", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModals = () => {
    setShowViewModal(false);
    setShowAssignModal(false);
    setSelectedTicket(null);
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return;

    const newStatus = destination.droppableId;
    const originalTickets = [...tickets];

    // Optimistic update
    setTickets((prev) =>
      prev.map((t) =>
        t.id === draggableId
          ? { ...t, status: newStatus as typeof t.status }
          : t,
      ),
    );

    try {
      // [SEC] FIX: Backend Zod schema requires resolutionType when status is RESOLVED/CLOSED
      const payload: Record<string, string> = { status: newStatus };
      if (newStatus === "RESOLVED" || newStatus === "CLOSED") {
        payload.resolutionType = "SUPPORT"; // Default for Kanban quick-resolve
      }
      await updateTicket(draggableId, payload);
      toast.success(t("tickets_kanban.toasts.status_updated", "Estado actualizado"));
    } catch {
      setTickets(originalTickets);
      toast.error(t("tickets_kanban.toasts.err_status", "Error al actualizar el estado"));
    }
  };

  // ─── COMPUTED DATA ───
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // [CRM] Filter: Do not show group chats in the Kanban view
      if (t.isGroup) return false;

      if (filterPriority === "ALL") return true;
      return t.priority?.toUpperCase() === filterPriority;
    });
  }, [tickets, filterPriority]);

  const stats = useMemo(() => {
    // [CRM] Filter groups for consistent statistics
    const nonGroupTickets = tickets.filter(t => !t.isGroup);
    
    const urgent = nonGroupTickets.filter(
      (t) =>
        t.priority?.toUpperCase() === "CRITICAL" ||
        t.priority?.toUpperCase() === "HIGH",
    ).length;
    const inProgress = nonGroupTickets.filter(
      (t) => t.status === "IN_PROGRESS",
    ).length;
    const open = nonGroupTickets.filter((t) => t.status === "OPEN").length;
    return { total: nonGroupTickets.length, urgent, inProgress, open };
  }, [tickets]);

  // ─── ASSIGN HANDLER ───
  const handleAssign = async (agentId: string, agentName: string) => {
    if (!selectedTicket) return;
    setAssigning(agentId);
    try {
      await updateTicket(selectedTicket.id, { assignedToId: agentId });
      toast.success(t("tickets_kanban.toasts.assign_success", { name: agentName, defaultValue: `Ticket asignado a ${agentName}` }));
      fetchTickets();
      handleCloseModals();
    } catch {
      toast.error(t("tickets_kanban.toasts.err_assign", "Error al asignar el ticket"));
    } finally {
      setAssigning(null);
    }
  };

  // ─── NAVIGATE TO CHAT ───
  const handleGoToChat = (ticket: Ticket) => {
    const ticketId = ticket.conversationId || ticket.id;
    window.location.href = `/workspace?ticketId=${ticketId}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">{t("tickets_kanban.labels.loading", "Cargando tickets...")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark">
      {/* ─── STATS TOOLBAR ─── */}
      <div
        className={`bg-white dark:bg-reply-panel-dark border-b border-gray-200 dark:border-reply-border-dark flex flex-wrap justify-between items-center gap-3 ${isWidget ? "px-4 py-2" : "px-6 py-3"}`}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {/* Total */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/15 rounded-lg border border-indigo-100/80 dark:border-indigo-800/50">
            <Hash className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              {t("tickets_kanban.labels.total", "Total")}
            </span>
            <span className="text-base font-extrabold text-indigo-700 dark:text-indigo-300">
              {stats.total}
            </span>
          </div>

          {!isWidget && (
            <>
              {/* Urgent */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/15 rounded-lg border border-red-100/80 dark:border-red-800/50">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                  {t("tickets_kanban.labels.urgent", "Urgentes")}
                </span>
                <span className="text-base font-extrabold text-red-700 dark:text-red-300">
                  {stats.urgent}
                </span>
              </div>

              {/* In Progress */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/15 rounded-lg border border-amber-100/80 dark:border-amber-800/50">
                <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  {t("tickets_kanban.labels.in_progress", "En Progreso")}
                </span>
                <span className="text-base font-extrabold text-amber-700 dark:text-amber-300">
                  {stats.inProgress}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Filter */}
        <select
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-gray-700 dark:text-gray-300 cursor-pointer"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
        >
          <option value="ALL">{t("tickets_kanban.labels.all_priorities", "Todas las prioridades")}</option>
          <option value="CRITICAL">{t("tickets_kanban.priorities.critical", "Crítico")}</option>
          <option value="HIGH">{t("tickets_kanban.priorities.high", "Alta")}</option>
          <option value="MEDIUM">{t("tickets_kanban.priorities.medium", "Media")}</option>
          <option value="LOW">{t("tickets_kanban.priorities.low", "Baja")}</option>
        </select>
      </div>

      {/* ─── KANBAN BOARD ─── */}
      <div className={`flex-1 overflow-x-auto ${isWidget ? "p-2" : "p-4 lg:p-6"}`}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full min-w-max">
            {localizedColumns.map((column) => {
              const columnTickets = filteredTickets.filter(
                (t) => t.status === column.id,
              );

              return (
                <div
                  key={column.id}
                  className="w-80 flex flex-col h-full bg-gray-50/80 dark:bg-reply-surface-dark/40 rounded-xl border border-gray-200/60 dark:border-reply-border-dark/50"
                >
                  {/* Column Header */}
                  <div className="p-3 bg-white dark:bg-reply-panel-dark rounded-t-xl border-b border-gray-100 dark:border-reply-border-dark">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${column.dot} shadow-sm`}
                        />
                        <h3 className="font-bold text-gray-700 dark:text-gray-200 text-xs uppercase tracking-wider">
                          {column.title}
                        </h3>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${column.badge}`}
                      >
                        {columnTickets.length}
                      </span>
                    </div>
                    {/* Column progress bar */}
                    {stats.total > 0 && (
                      <div className="mt-2 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${column.accent} rounded-full transition-all duration-500`}
                          style={{
                            width: `${(columnTickets.length / stats.total) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Droppable Area */}
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 p-2.5 overflow-y-auto scrollbar-thin transition-colors ${
                          snapshot.isDraggingOver
                            ? `${column.bg} ring-2 ring-inset ring-indigo-300/50 dark:ring-indigo-600/50`
                            : ""
                        }`}
                      >
                        {columnTickets.map((ticket, index) => {
                          const priority = getLocalizedPriority(ticket.priority);
                          const contactName =
                            ticket.contact?.name || t("tickets_kanban.labels.no_name", "Sin Nombre");
                          const contactPhone = ticket.contact?.phone || "";
                          // Don't show @whatsapp.user emails
                          const contactEmail =
                            ticket.contact?.email &&
                            !ticket.contact.email.includes("@whatsapp")
                              ? ticket.contact.email
                              : "";

                          return (
                            <Draggable
                              key={ticket.id}
                              draggableId={ticket.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={`bg-white dark:bg-reply-panel-dark rounded-xl border mb-2.5 transition-all duration-200 overflow-hidden group ${
                                    snapshot.isDragging
                                      ? "rotate-1 scale-[1.03] shadow-2xl ring-2 ring-indigo-500/60 z-50"
                                      : "shadow-sm hover:shadow-md border-gray-200/80 dark:border-reply-border-dark hover:-translate-y-0.5"
                                  }`}
                                  style={provided.draggableProps.style}
                                >
                                  {/* Top accent line */}
                                  <div
                                    className={`h-0.5 bg-gradient-to-r ${column.accent}`}
                                  />

                                  {/* Card Header: Priority + Channel + Wait Time */}
                                  <div className="px-3 pt-2.5 pb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <ChannelIcon
                                        channel={ticket.channel}
                                      />
                                      <span
                                        className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase ${priority.bg} ${priority.color}`}
                                      >
                                        {priority.label}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] font-medium text-gray-400 dark:text-gray-500">
                                      <Clock className="w-3 h-3" />
                                      <span>
                                        {formatWaitTime(ticket.createdAt)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Contact Row */}
                                  <div className="px-3 pb-2 flex items-center gap-2.5">
                                    <Avatar
                                      src={
                                        ticket.contact?.profilePicUrl ||
                                        ticket.contact?.avatarUrl ||
                                        null
                                      }
                                      name={contactName}
                                      className="w-9 h-9 text-xs shadow-sm"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-bold text-gray-800 dark:text-gray-100 truncate text-sm leading-tight">
                                        {contactName}
                                      </h4>
                                      {(contactPhone || contactEmail) && (
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                          {contactPhone
                                            ? `+${contactPhone}`
                                            : contactEmail}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Last Message */}
                                  {ticket.lastMessage && (
                                    <div className="mx-3 mb-2.5 bg-gray-50 dark:bg-gray-800/40 rounded-lg px-2.5 py-2 border border-gray-100 dark:border-gray-700/40">
                                      <p className="text-[11px] text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                                        {ticket.lastMessage}
                                      </p>
                                    </div>
                                  )}

                                  {/* Predefined Assigned Tags */}
                                  {(() => {
                                    const visibleTags = (ticket.tags || [])
                                      .map((tagId) =>
                                        allTags.find((t) => t.id === tagId || t.name === tagId)
                                      )
                                      .filter((tagInfo): tagInfo is TagType => !!tagInfo);

                                    if (visibleTags.length === 0) return null;

                                    return (
                                      <div className="px-3 pb-2 flex flex-wrap gap-1">
                                        {visibleTags.slice(0, 4).map((tagInfo, idx) => {
                                          const tagColorClass =
                                            tagInfo.color ||
                                            "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300 border-indigo-100/60 dark:border-indigo-800/30";

                                          return (
                                            <span
                                              key={idx}
                                              className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium border flex items-center gap-0.5 transition-all hover:scale-105 ${tagColorClass}`}
                                            >
                                              <Tag className="w-2 h-2" />
                                              {tagInfo.name}
                                            </span>
                                          );
                                        })}
                                        {visibleTags.length > 4 && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 font-medium">
                                            +{visibleTags.length - 4}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Footer: Ticket Number + Assigned Agent + Actions */}
                                  <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700/40 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                                        #{ticket.ticketNumber || ticket.id.slice(-6)}
                                      </span>
                                      {ticket.assignedTo && (
                                        <span className="text-[9px] text-blue-500 dark:text-blue-400 font-medium flex items-center gap-0.5">
                                          <UserPlus className="w-2.5 h-2.5" />
                                          {ticket.assignedTo.name.split(" ")[0]}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                                        title={t("tickets_kanban.labels.view_details", "Ver detalles")}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTicket(ticket);
                                          setShowViewModal(true);
                                        }}
                                      >
                                        <Eye className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                                      </button>
                                      <button
                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                                        title={t("tickets_kanban.labels.assign_agent", "Asignar agente")}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTicket(ticket);
                                          setShowAssignModal(true);
                                        }}
                                      >
                                        <UserPlus className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}

                        {/* Empty Column State */}
                        {columnTickets.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-10 text-center">
                            <div
                              className={`w-10 h-10 rounded-full ${column.bg} flex items-center justify-center mb-3`}
                            >
                              <div
                                className={`w-3 h-3 rounded-full ${column.dot} opacity-40`}
                              />
                            </div>
                            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
                              {t("tickets_kanban.labels.no_tickets", "Sin tickets")}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* ─── VIEW DETAILS MODAL ─── */}
      {showViewModal && selectedTicket && (
        <Modal
          isOpen
          onClose={handleCloseModals}
          title={t("tickets_kanban.labels.ticket_details", "Detalles del Ticket")}
          subtitle={`#${selectedTicket.ticketNumber || selectedTicket.id.slice(-8)}`}
          icon={<Eye className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
          size="md"
          footer={
            <>
              <ModalButton variant="secondary" onClick={handleCloseModals}>
                {t("tickets_kanban.labels.close", "Cerrar")}
              </ModalButton>
              <ModalButton variant="primary" onClick={() => handleGoToChat(selectedTicket)}>
                <ExternalLink className="w-3.5 h-3.5" />
                {t("tickets_kanban.labels.go_to_chat", "Ir al Chat")}
              </ModalButton>
            </>
          }
        >
            {/* Body */}
            <div className="space-y-4">
              {/* Contact */}
              <div className="flex items-center gap-3 p-3.5 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-700/40">
                <Avatar
                  src={
                    selectedTicket.contact?.profilePicUrl ||
                    selectedTicket.contact?.avatarUrl ||
                    null
                  }
                  name={selectedTicket.contact?.name || ""}
                  className="w-12 h-12 shadow-sm"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-gray-800 dark:text-white text-sm truncate">
                    {selectedTicket.contact?.name || t("tickets_kanban.labels.no_name", "Sin Nombre")}
                  </h4>
                  {selectedTicket.contact?.phone && (
                    <p className="text-xs text-gray-500 font-mono flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" />+
                      {selectedTicket.contact.phone}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-md border font-bold ${getLocalizedPriority(selectedTicket.priority).bg} ${getLocalizedPriority(selectedTicket.priority).color}`}
                  >
                    {getLocalizedPriority(selectedTicket.priority).label}
                  </span>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700/40">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    {t("tickets_kanban.labels.status", "Estado")}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white mt-0.5">
                    {localizedColumns.find((c) => c.id === selectedTicket.status)
                      ?.title || selectedTicket.status}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700/40">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    {t("tickets_kanban.labels.wait", "Espera")}
                  </p>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                    {formatWaitTime(selectedTicket.createdAt)}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700/40">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    {t("tickets_kanban.labels.channel", "Canal")}
                  </p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white mt-0.5 flex items-center gap-1.5">
                    <ChannelIcon channel={selectedTicket.channel} className="w-3.5 h-3.5" />
                    {selectedTicket.channel}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700/40">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    {t("tickets_kanban.labels.created", "Creado")}
                  </p>
                  <p className="text-sm font-medium text-gray-800 dark:text-white mt-0.5">
                    {new Date(selectedTicket.createdAt).toLocaleDateString(
                      i18n.language,
                      { day: "numeric", month: "short" },
                    )}
                  </p>
                </div>
              </div>

              {/* Last Message */}
              {selectedTicket.lastMessage && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" />
                    {t("tickets_kanban.labels.last_message", "Último Mensaje")}
                  </p>
                  <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 border border-gray-100 dark:border-gray-700/40">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {selectedTicket.lastMessage}
                    </p>
                  </div>
                </div>
              )}
            </div>
        </Modal>
      )}

      {/* ─── ASSIGN AGENT MODAL ─── */}
      {showAssignModal && selectedTicket && (
        <Modal
          isOpen
          onClose={handleCloseModals}
          title={t("tickets_kanban.labels.assign_title", "Asignar Agente")}
          subtitle={`${selectedTicket.contact?.name} · #${selectedTicket.ticketNumber || selectedTicket.id.slice(-6)}`}
          icon={<UserPlus className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
          size="sm"
          footer={
            <ModalButton variant="secondary" onClick={handleCloseModals}>
              {t("tickets_kanban.labels.cancel", "Cancelar")}
            </ModalButton>
          }
        >
            {/* Agent List */}
            <div className="space-y-1.5">
              {agents.length === 0 ? (
                <div className="text-center py-6">
                  <UserPlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    {t("tickets_kanban.labels.no_agents", "No hay agentes disponibles")}
                  </p>
                </div>
              ) : (
                agents.map((agent) => (
                  <button
                    key={agent.id}
                    disabled={!!assigning}
                    onClick={() => handleAssign(agent.id, agent.name)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                      assigning === agent.id
                        ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700"
                        : "bg-gray-50 dark:bg-gray-800/40 border-transparent hover:bg-indigo-50 dark:hover:bg-indigo-900/10 hover:border-indigo-200 dark:hover:border-indigo-800"
                    }`}
                  >
                    <Avatar
                      src={agent.avatar || null}
                      name={agent.name}
                      className="w-9 h-9 text-xs"
                    />
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-semibold text-gray-800 dark:text-white text-sm truncate">
                        {agent.name}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 capitalize">
                        {agent.role?.toLowerCase() || "Agente"}
                      </p>
                    </div>
                    {assigning === agent.id ? (
                      <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                    )}
                  </button>
                ))
              )}
            </div>
        </Modal>
      )}
    </div>
  );
};
