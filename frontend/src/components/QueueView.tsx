import React, { useState, useMemo } from "react";
import {
  Clock,
  AlertTriangle,
  Users,
  Timer,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Zap,
  Filter,
  ArrowUpDown,
  ArrowRightLeft,
} from "lucide-react";
import { Ticket, Contact } from "@/types";

// 100-Year Solution: Strict Types
type PriorityLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type SortField = "waitTime" | "priority" | "lastMessage";
type SortDirection = "asc" | "desc";

interface QueueViewProps {
  tickets: Ticket[];
  activeTicketId: string | null;
  onSelectTicket: (id: string) => void;
  // 🏢 ENTERPRISE: Transfer from Queue
  onTransferTicket?: (ticketId: string) => void;
}

// Helper: Calculate wait time in minutes
const getWaitTimeMinutes = (dateStr: string): number => {
  const created = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - created) / 60000);
};

// Helper: Format wait time for display
const formatWaitTime = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};

// Helper: Get priority config
const getPriorityConfig = (
  priority: string,
): { color: string; label: string; order: number } => {
  switch (priority?.toUpperCase()) {
    case "CRITICAL":
      return { color: "bg-red-500", label: "Crítico", order: 0 };
    case "HIGH":
      return { color: "bg-orange-500", label: "Alta", order: 1 };
    case "MEDIUM":
      return { color: "bg-yellow-500", label: "Media", order: 2 };
    case "LOW":
      return { color: "bg-blue-500", label: "Baja", order: 3 };
    default:
      return { color: "bg-gray-500", label: "Normal", order: 2 };
  }
};

export const QueueView: React.FC<QueueViewProps> = ({
  tickets,
  activeTicketId,
  onSelectTicket,
  onTransferTicket,
}) => {
  const [sortField, setSortField] = useState<SortField>("waitTime");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [expandedPriority, setExpandedPriority] = useState<string | null>(null);
  const [groupByPriority, setGroupByPriority] = useState(true);

  // Enrich tickets with calculated wait times
  const enrichedTickets = useMemo(() => {
    return tickets.map((t) => ({
      ...t,
      waitMinutes: getWaitTimeMinutes(t.createdAt),
    }));
  }, [tickets]);

  // Sort tickets
  const sortedTickets = useMemo(() => {
    const sorted = [...enrichedTickets].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "waitTime":
          comparison = b.waitMinutes - a.waitMinutes;
          break;
        case "priority":
          comparison =
            getPriorityConfig(a.priority).order -
            getPriorityConfig(b.priority).order;
          break;
        case "lastMessage":
          comparison =
            new Date(b.lastMessageAt).getTime() -
            new Date(a.lastMessageAt).getTime();
          break;
      }
      return sortDirection === "asc" ? -comparison : comparison;
    });
    return sorted;
  }, [enrichedTickets, sortField, sortDirection]);

  // Group by priority if enabled
  const groupedTickets = useMemo(() => {
    if (!groupByPriority) return { all: sortedTickets };

    const groups: Record<string, typeof sortedTickets> = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
    };

    sortedTickets.forEach((t) => {
      const key = t.priority?.toUpperCase() || "MEDIUM";
      if (groups[key]) {
        groups[key].push(t);
      } else {
        groups.MEDIUM.push(t);
      }
    });

    return groups;
  }, [sortedTickets, groupByPriority]);

  // Stats
  const stats = useMemo(() => {
    const total = enrichedTickets.length;
    const avgWait =
      total > 0
        ? Math.round(
            enrichedTickets.reduce((sum, t) => sum + t.waitMinutes, 0) / total,
          )
        : 0;
    const critical = enrichedTickets.filter(
      (t) => t.priority?.toUpperCase() === "CRITICAL" || t.waitMinutes > 30,
    ).length;
    return { total, avgWait, critical };
  }, [enrichedTickets]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const renderTicketRow = (ticket: (typeof sortedTickets)[0]) => {
    const isActive = activeTicketId === ticket.id;
    const priorityConfig = getPriorityConfig(ticket.priority);
    const isUrgent = ticket.waitMinutes > 30;

    return (
      <div
        key={ticket.id}
        className={`
          flex items-center gap-3 p-3 cursor-pointer transition-all relative group
          border-b border-gray-100 dark:border-reply-border-dark
          hover:bg-reply-bg dark:hover:bg-reply-panel-dark
          ${isActive ? "bg-orange-50 dark:bg-orange-900/20 border-l-4 border-l-orange-500" : "border-l-4 border-l-transparent"}
        `}
      >
        {/* Priority Indicator */}
        <div className="flex flex-col items-center gap-1">
          <div
            className={`w-3 h-3 rounded-full ${priorityConfig.color} shadow-sm`}
            title={priorityConfig.label}
          />
          {isUrgent && (
            <AlertTriangle className="w-3 h-3 text-red-500 animate-bounce" />
          )}
        </div>

        {/* Avatar */}
        <div
          className="relative flex-shrink-0"
          onClick={() => onSelectTicket(ticket.id)}
        >
          {ticket.contact.profilePicUrl || ticket.contact.avatarUrl ? (
            <img
              src={ticket.contact.profilePicUrl || ticket.contact.avatarUrl}
              alt={ticket.contact.name}
              className="w-10 h-10 rounded-full object-cover shadow-sm"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              {ticket.contact.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Content - Clickable to select */}
        <div
          className="flex-1 min-w-0"
          onClick={() => onSelectTicket(ticket.id)}
        >
          <div className="flex justify-between items-center">
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
              {ticket.contact.name}
            </h4>
            <div className="flex items-center gap-1 text-orange-500 dark:text-orange-400">
              <Timer className="w-3 h-3" />
              <span className="text-xs font-bold">
                {formatWaitTime(ticket.waitMinutes)}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {ticket.lastMessage || "Sin mensaje previo"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {ticket.contact.isGroup && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold flex items-center gap-1">
                <Users className="w-2 h-2" /> GRUPO
              </span>
            )}
            {ticket.queue?.name && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                {ticket.queue.name}
              </span>
            )}
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded text-white font-bold ${priorityConfig.color}`}
            >
              {priorityConfig.label}
            </span>
          </div>
        </div>

        {/* 🏢 ENTERPRISE: Transfer Button (visible on hover) */}
        {onTransferTicket && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTransferTicket(ticket.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white shadow-lg transition-all transform hover:scale-105 flex-shrink-0"
            title="Transferir a Agente o Cola"
          >
            <ArrowRightLeft className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="w-full bg-white dark:bg-reply-surface-dark border-r border-gray-200 dark:border-reply-border-dark flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-reply-border-dark bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-500 rounded-lg shadow-sm">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">
                Cola de Espera
              </h2>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {stats.total} tickets pendientes
              </p>
            </div>
          </div>
          <button
            onClick={() => setGroupByPriority(!groupByPriority)}
            className={`p-2 rounded-lg transition-colors ${
              groupByPriority
                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600"
                : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            title="Agrupar por prioridad"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-orange-200/50 dark:border-orange-700/30">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[10px] text-gray-600 dark:text-gray-300">
              Promedio: <strong>{formatWaitTime(stats.avgWait)}</strong>
            </span>
          </div>
          {stats.critical > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <span className="text-[10px] text-red-600 dark:text-red-400 font-bold">
                {stats.critical} urgentes
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Sort Controls - Responsive & Compact */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-reply-border-dark flex items-center gap-2 bg-reply-bg/50 dark:bg-reply-bg-dark/50 overflow-hidden">
        {/* Compact Label / Icon */}
        <div className="flex-shrink-0 text-gray-400" title="Ordenar por">
          <ArrowUpDown className="w-3 h-3" />
        </div>

        {/* Scrollable Container for Filters */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar mask-gradient-right flex-1 p-0.5">
          {[
            { field: "waitTime" as SortField, label: "Tiempo", icon: Timer },
            { field: "priority" as SortField, label: "Prioridad", icon: Zap },
            {
              field: "lastMessage" as SortField,
              label: "Reciente",
              icon: MessageSquare,
            },
          ].map(({ field, label, icon: Icon }) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`
                flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-all border
                ${
                  sortField === field
                    ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800"
                    : "bg-white text-gray-600 border-gray-200 hover:border-orange-300 dark:bg-gray-800 dark:text-gray-400 dark:border-reply-border-dark dark:hover:border-gray-600"
                }
              `}
            >
              <Icon className="w-3 h-3" />
              <span>{label}</span>
              {sortField === field && (
                <span className="text-[9px] opacity-70">
                  {sortDirection === "asc" ? "↑" : "↓"}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {groupByPriority
          ? // Grouped View
            Object.entries(groupedTickets).map(([priority, ticketGroup]) => {
              if (ticketGroup.length === 0) return null;
              const config = getPriorityConfig(priority);
              const isExpanded =
                expandedPriority === null || expandedPriority === priority;

              return (
                <div key={priority}>
                  <button
                    onClick={() =>
                      setExpandedPriority((prev) =>
                        prev === priority ? null : priority,
                      )
                    }
                    className={`w-full px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider flex items-center justify-between ${config.color} bg-opacity-10 dark:bg-opacity-20 border-b border-gray-100 dark:border-reply-border-dark sticky top-0 z-10`}
                    style={{ color: config.color.replace("bg-", "") }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${config.color}`}
                      />
                      {config.label} ({ticketGroup.length})
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                  {isExpanded && ticketGroup.map(renderTicketRow)}
                </div>
              );
            })
          : // Flat View
            sortedTickets.map(renderTicketRow)}

        {tickets.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Cola vacía</p>
            <p className="text-xs mt-1">
              No hay tickets pendientes de atención
            </p>
          </div>
        )}
      </div>
    </div>
  );
};


