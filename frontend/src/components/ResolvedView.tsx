import React, { useState, useMemo } from "react";
import {
  CheckCircle,
  Clock,
  Calendar,
  TrendingUp,
  MessageSquare,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Star,
  ThumbsUp,
  Timer,
  BarChart3,
  Filter,
} from "lucide-react";
import { Ticket } from "@/types";

// 100-Year Solution: Strict Types
type DateFilter = "today" | "week" | "month" | "all";
type SortField = "resolvedAt" | "responseTime" | "satisfaction";
type SortDirection = "asc" | "desc";

interface ResolvedViewProps {
  tickets: Ticket[];
  activeTicketId: string | null;
  onSelectTicket: (id: string) => void;
}

// Helper: Calculate resolution time in minutes
const getResolutionTime = (
  createdAt: string,
  resolvedAt: string | null | undefined,
): number => {
  if (!resolvedAt) return 0;
  const start = new Date(createdAt).getTime();
  const end = new Date(resolvedAt).getTime();
  return Math.floor((end - start) / 60000);
};

// Helper: Format duration
const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};

// Helper: Get date filter bounds
const getDateBounds = (filter: DateFilter): { start: Date; end: Date } => {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);

  switch (filter) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "week":
      start.setDate(now.getDate() - 7);
      break;
    case "month":
      start.setMonth(now.getMonth() - 1);
      break;
    case "all":
      start = new Date(0);
      break;
  }

  return { start, end };
};

// Helper: Get resolution type config
const getResolutionConfig = (
  type: string | null | undefined,
): { color: string; label: string; icon: typeof CheckCircle } => {
  switch (type?.toUpperCase()) {
    case "RESOLVED":
      return {
        color: "text-green-500 bg-green-100 dark:bg-green-900/30",
        label: "Resuelto",
        icon: CheckCircle,
      };
    case "CLOSED":
      return {
        color: "text-gray-500 bg-gray-100 dark:bg-gray-700",
        label: "Cerrado",
        icon: CheckCircle,
      };
    case "ESCALATED":
      return {
        color: "text-orange-500 bg-orange-100 dark:bg-orange-900/30",
        label: "Escalado",
        icon: TrendingUp,
      };
    default:
      return {
        color: "text-green-500 bg-green-100 dark:bg-green-900/30",
        label: "Completado",
        icon: CheckCircle,
      };
  }
};

export const ResolvedView: React.FC<ResolvedViewProps> = ({
  tickets,
  activeTicketId,
  onSelectTicket,
}) => {
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [sortField, setSortField] = useState<SortField>("resolvedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");

  // Enrich tickets with resolution metrics
  const enrichedTickets = useMemo(() => {
    return tickets.map((t) => ({
      ...t,
      resolutionMinutes: getResolutionTime(t.createdAt, t.resolvedAt),
      resolvedDate: t.resolvedAt
        ? new Date(t.resolvedAt)
        : new Date(t.updatedAt),
    }));
  }, [tickets]);

  // Filter by date and search
  const filteredTickets = useMemo(() => {
    const { start, end } = getDateBounds(dateFilter);

    return enrichedTickets.filter((t) => {
      const matchesDate = t.resolvedDate >= start && t.resolvedDate <= end;
      const matchesSearch =
        !searchQuery ||
        t.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesDate && matchesSearch;
    });
  }, [enrichedTickets, dateFilter, searchQuery]);

  // Sort tickets
  const sortedTickets = useMemo(() => {
    return [...filteredTickets].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "resolvedAt":
          comparison = b.resolvedDate.getTime() - a.resolvedDate.getTime();
          break;
        case "responseTime":
          comparison = a.resolutionMinutes - b.resolutionMinutes;
          break;
        case "satisfaction":
          // Could be extended with actual satisfaction scores
          comparison = 0;
          break;
      }
      return sortDirection === "asc" ? -comparison : comparison;
    });
  }, [filteredTickets, sortField, sortDirection]);

  // Group by date for better organization
  const groupedByDate = useMemo(() => {
    const groups: Record<string, typeof sortedTickets> = {};

    sortedTickets.forEach((t) => {
      const dateKey = t.resolvedDate.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(t);
    });

    return groups;
  }, [sortedTickets]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredTickets.length;
    const avgResolution =
      total > 0
        ? Math.round(
            filteredTickets.reduce((sum, t) => sum + t.resolutionMinutes, 0) /
              total,
          )
        : 0;
    const fastResolutions = filteredTickets.filter(
      (t) => t.resolutionMinutes < 30,
    ).length;
    const fastRate =
      total > 0 ? Math.round((fastResolutions / total) * 100) : 0;

    return { total, avgResolution, fastRate };
  }, [filteredTickets]);

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
    const config = getResolutionConfig(ticket.status);
    const isFastResolution = ticket.resolutionMinutes < 30;

    return (
      <div
        key={ticket.id}
        onClick={() => onSelectTicket(ticket.id)}
        className={`
          flex items-center gap-3 p-3 cursor-pointer transition-all relative group
          border-b border-gray-100 dark:border-reply-border-dark
          hover:bg-reply-bg dark:hover:bg-reply-panel-dark
          ${isActive ? "bg-green-50 dark:bg-green-900/20 border-l-4 border-l-green-500" : "border-l-4 border-l-transparent"}
        `}
      >
        {/* Status Icon */}
        <div className={`p-1.5 rounded-lg ${config.color}`}>
          <config.icon className="w-4 h-4" />
        </div>

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {ticket.contact.profilePicUrl || ticket.contact.avatarUrl ? (
            <img
              src={ticket.contact.profilePicUrl || ticket.contact.avatarUrl}
              alt={ticket.contact.name}
              className="w-10 h-10 rounded-full object-cover shadow-sm opacity-80"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white font-bold text-sm shadow-sm opacity-80">
              {ticket.contact.name.charAt(0).toUpperCase()}
            </div>
          )}
          {isFastResolution && (
            <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full p-0.5 border-2 border-white dark:border-reply-border-dark">
              <Star className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center">
            <h4 className="font-medium text-gray-700 dark:text-gray-300 text-sm truncate">
              {ticket.contact.name}
            </h4>
            <span className="text-[10px] text-gray-400">
              {ticket.resolvedDate.toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
            {ticket.subject || ticket.lastMessage || "Conversación completada"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-[9px] text-gray-400">
              <Timer className="w-3 h-3" />
              {formatDuration(ticket.resolutionMinutes)}
            </span>
            {ticket.assignedTo?.name && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium">
                {ticket.assignedTo.name}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full bg-white dark:bg-reply-surface-dark border-r border-gray-200 dark:border-reply-border-dark flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-reply-border-dark bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-green-500 rounded-lg shadow-sm">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">
                Historial Resuelto
              </h2>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {stats.total} tickets completados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <BarChart3 className="w-4 h-4 text-green-500" />
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-green-200/50 dark:border-green-700/30">
          <div className="flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-green-500" />
            <span className="text-[10px] text-gray-600 dark:text-gray-300">
              Promedio: <strong>{formatDuration(stats.avgResolution)}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-[10px] text-gray-600 dark:text-gray-300">
              Rpidos: <strong>{stats.fastRate}%</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Date Filter Tabs */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-reply-border-dark flex items-center gap-2 bg-reply-bg/50 dark:bg-reply-bg-dark/50">
        {[
          { key: "today" as DateFilter, label: "Hoy" },
          { key: "week" as DateFilter, label: "Semana" },
          { key: "month" as DateFilter, label: "Mes" },
          { key: "all" as DateFilter, label: "Todo" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setDateFilter(key)}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors ${
              dateFilter === key
                ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-reply-border-dark">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar en historial..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-100 dark:bg-reply-panel-dark border-0 rounded-lg focus:ring-2 focus:ring-green-500 dark:text-white placeholder-gray-400"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {Object.entries(groupedByDate).map(([dateLabel, ticketGroup]) => (
          <div key={dateLabel}>
            <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-reply-bg/80 dark:bg-reply-surface-dark/80 backdrop-blur sticky top-0 z-10 border-b border-gray-100 dark:border-reply-border-dark flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              {dateLabel}
              <span className="ml-auto text-gray-300">
                ({ticketGroup.length})
              </span>
            </div>
            {ticketGroup.map(renderTicketRow)}
          </div>
        ))}

        {sortedTickets.length === 0 && (
          <div className="p-8 text-center text-gray-400">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin resultados</p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "No se encontraron tickets con esos criterios"
                : "No hay tickets resueltos en este período"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};


