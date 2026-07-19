import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/axios";
import { toast } from "sonner";
import { ModuleHeader } from "@/components/common/ModuleHeader";
import { ComposeModal } from "@/components/email/ComposeModal";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";
import {
  Mail,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Send,
  User,
  Clock,
  Paperclip,
  Inbox as InboxIcon,
  CheckCircle2,
  AlertTriangle,
  Eye,
  MousePointerClick,
  Plus,
  Reply,
  ReplyAll,
  Forward,
} from "lucide-react";

// ────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────

interface EmailContact {
  id: string;
  name: string | null;
  email: string | null;
}

interface EmailTicket {
  id: string;
  ticketNumber: string;
}

interface EmailItem {
  id: string;
  messageId: string | null;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
  type: "INBOUND" | "OUTBOUND";
  status: string;
  createdAt: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  contact: EmailContact | null;
  ticket: EmailTicket | null;
  attachments: unknown;
}

type FilterType = "ALL" | "INBOUND" | "OUTBOUND";
type FilterStatus = "ALL" | "SENT" | "DELIVERED" | "OPENED" | "CLICKED" | "BOUNCED" | "FAILED";

// ────────────────────────────────────────────────
// STATUS BADGE
// ────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  SENT: { label: "Enviado", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: <Send size={12} /> },
  DELIVERED: { label: "Entregado", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <CheckCircle2 size={12} /> },
  OPENED: { label: "Leído", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400", icon: <Eye size={12} /> },
  CLICKED: { label: "Clickeado", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: <MousePointerClick size={12} /> },
  BOUNCED: { label: "Rebotado", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <AlertTriangle size={12} /> },
  SPAM: { label: "Spam", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: <AlertTriangle size={12} /> },
  FAILED: { label: "Fallido", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <X size={12} /> },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg = statusConfig[status] || { label: status, color: "bg-gray-100 text-gray-600", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────

interface EmailInboxCache {
  emails: EmailItem[];
  total: number;
}

const EMAIL_INBOX_CACHE_KEY = "email:default-view";

export const EmailInbox: React.FC = () => {
  const { t } = useTranslation();

  // State. Stale-while-revalidate: re-entering the module on the default
  // (page 0, no filters) view renders instantly and refetches silently.
  const cachedInbox = getModuleCache<EmailInboxCache>(EMAIL_INBOX_CACHE_KEY);
  const [emails, setEmails] = useState<EmailItem[]>(cachedInbox?.emails ?? []);
  const [total, setTotal] = useState(cachedInbox?.total ?? 0);
  const [loading, setLoading] = useState(!cachedInbox);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("ALL");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const limit = 25;

  // Dark mode tracking for iframe styles
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          setIsDark(document.documentElement.classList.contains("dark"));
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Compose state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"new" | "reply" | "replyAll" | "forward">("new");

  const openCompose = (mode: "new" | "reply" | "replyAll" | "forward") => {
    setComposeMode(mode);
    setComposeOpen(true);
  };

  const handleEmailSent = () => {
    setRefreshing(true);
    fetchEmails();
  };

  // Fetch emails
  const fetchEmails = useCallback(async () => {
    const isDefaultView = page === 0 && filterType === "ALL" && filterStatus === "ALL" && !search.trim();
    if (!(isDefaultView && getModuleCache<EmailInboxCache>(EMAIL_INBOX_CACHE_KEY))) {
      setLoading(true);
    }
    try {
      const params: Record<string, string | number> = {
        limit,
        offset: page * limit,
      };
      if (filterType !== "ALL") params.type = filterType;
      if (filterStatus !== "ALL") params.status = filterStatus;
      if (search.trim()) params.search = search.trim();

      const res = await api.get("/emails", { params });
      const data = res.data;
      const emailList = data.data?.emails || [];
      const totalCount = data.total || 0;
      setEmails(emailList);
      setTotal(totalCount);
      if (isDefaultView) {
        setModuleCache<EmailInboxCache>(EMAIL_INBOX_CACHE_KEY, { emails: emailList, total: totalCount });
      }
    } catch (error) {
      console.error("Failed to fetch emails:", error);
      toast.error("Error al cargar emails");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, filterType, filterStatus, search]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEmails();
  };

  const totalPages = Math.ceil(total / limit);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return "Ahora";
    if (mins < 60) return `hace ${mins}m`;
    if (hours < 24) return `hace ${hours}h`;
    if (days < 7) return `hace ${days}d`;
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  };

  const extractName = (from: string): string => {
    const match = from.match(/^(.+?)\s*</);
    if (match) return match[1].replace(/"/g, "").trim();
    return from.split("@")[0];
  };

  return (
    <div className="h-full bg-reply-bg dark:bg-reply-bg-dark flex flex-col transition-colors duration-200">
      <ModuleHeader
        title={t("email_inbox.title", "Bandeja de Email")}
        description={t("email_inbox.description", "Visualiza y gestiona todos los correos de tu empresa.")}
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
        gradient="from-violet-600 to-indigo-600 dark:from-violet-800 dark:to-indigo-800"
      />

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* ═══════════════════════════════════════════
            LEFT PANEL — Email List
            ═══════════════════════════════════════════ */}
        <div className={`${selectedEmail ? "hidden md:flex" : "flex"} flex-col w-full md:w-[420px] lg:w-[480px] border-r border-gray-200 dark:border-reply-border-dark bg-white dark:bg-reply-surface-dark shrink-0`}>
          {/* Toolbar */}
          <div className="p-4 border-b border-gray-100 dark:border-reply-border-dark/60 space-y-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-full pl-10 pr-10 py-2.5 border border-gray-200 dark:border-gray-600 bg-reply-bg dark:bg-black/20 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                placeholder={t("email_inbox.search", "Buscar por asunto, remitente...")}
              />
              {search && (
                <button onClick={() => { setSearch(""); setPage(0); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filters + Refresh */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
                {(["ALL", "INBOUND", "OUTBOUND"] as FilterType[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setFilterType(f); setPage(0); }}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${
                      filterType === f
                        ? "bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {f === "ALL" ? "Todos" : f === "INBOUND" ? "Recibidos" : "Enviados"}
                  </button>
                ))}
              </div>

              <select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value as FilterStatus); setPage(0); }}
                className="text-[11px] font-bold border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5 outline-none appearance-none cursor-pointer"
              >
                <option value="ALL">Estado: Todos</option>
                <option value="SENT">Enviados</option>
                <option value="DELIVERED">Entregados</option>
                <option value="OPENED">Leídos</option>
                <option value="BOUNCED">Rebotados</option>
                <option value="FAILED">Fallidos</option>
              </select>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="ml-auto p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Refrescar"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Email List */}
          <div className="flex-1 overflow-y-auto">
            {loading && emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                <span className="text-sm text-gray-500">Cargando emails...</span>
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-8">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-2xl">
                  <InboxIcon size={32} className="text-indigo-400" />
                </div>
                <h4 className="font-bold text-gray-700 dark:text-gray-300">Sin emails</h4>
                <p className="text-xs text-gray-500">No se encontraron correos con los filtros actuales.</p>
              </div>
            ) : (
              emails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`w-full text-left p-4 border-b border-gray-50 dark:border-reply-border-dark/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/10 transition-colors group ${
                    selectedEmail?.id === email.id ? "bg-indigo-50 dark:bg-indigo-950/20 border-l-2 border-l-indigo-500" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Direction Icon */}
                    <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                      email.type === "INBOUND"
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    }`}>
                      {email.type === "INBOUND" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* From + Time */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-sm text-gray-900 dark:text-white truncate">
                          {email.contact?.name || extractName(email.from)}
                        </span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap flex items-center gap-1">
                          <Clock size={10} /> {formatDate(email.createdAt)}
                        </span>
                      </div>

                      {/* Subject */}
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate font-medium">
                        {email.subject || "(Sin asunto)"}
                      </p>

                      {/* Preview + Status */}
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <p className="text-xs text-gray-400 truncate flex-1">
                          {email.bodyText?.slice(0, 80) || "Sin vista previa..."}
                        </p>
                        <StatusBadge status={email.status} />
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-gray-100 dark:border-reply-border-dark/60 flex items-center justify-between bg-white dark:bg-reply-surface-dark">
              <span className="text-xs text-gray-500">
                {page * limit + 1}–{Math.min((page + 1) * limit, total)} de {total}
              </span>
              <div className="flex gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════
            RIGHT PANEL — Email Detail
            ═══════════════════════════════════════════ */}
        <div className={`${selectedEmail ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0 bg-reply-bg dark:bg-reply-bg-dark`}>
          {selectedEmail ? (
            <>
              {/* Detail Header */}
              <div className="p-6 bg-white dark:bg-reply-panel-dark border-b border-gray-200 dark:border-reply-border-dark">
                {/* Mobile back button */}
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="md:hidden flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 font-bold mb-4 hover:underline"
                >
                  <ChevronLeft size={16} /> Volver
                </button>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                      {selectedEmail.subject || "(Sin asunto)"}
                    </h2>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                        selectedEmail.type === "INBOUND"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                          : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                      }`}>
                        {selectedEmail.type === "INBOUND" ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                        {selectedEmail.type === "INBOUND" ? "Recibido" : "Enviado"}
                      </div>
                      <StatusBadge status={selectedEmail.status} />
                      {selectedEmail.ticket && (
                        <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg font-medium">
                          🎫 #{selectedEmail.ticket.ticketNumber}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openCompose("reply")} title="Responder" className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-lg transition-colors">
                      <Reply size={16} />
                    </button>
                    <button onClick={() => openCompose("replyAll")} title="Responder a Todos" className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-lg transition-colors">
                      <ReplyAll size={16} />
                    </button>
                    <button onClick={() => openCompose("forward")} title="Reenviar" className="p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-lg transition-colors">
                      <Forward size={16} />
                    </button>
                  </div>
                </div>

                {/* Metadata */}
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-bold w-12 shrink-0 text-xs uppercase">De:</span>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <User size={12} className="text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <span className="text-gray-800 dark:text-gray-200 font-medium">{selectedEmail.from}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-bold w-12 shrink-0 text-xs uppercase">Para:</span>
                    <span className="text-gray-600 dark:text-gray-400">{selectedEmail.to.join(", ")}</span>
                  </div>
                  {selectedEmail.cc.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-bold w-12 shrink-0 text-xs uppercase">CC:</span>
                      <span className="text-gray-600 dark:text-gray-400">{selectedEmail.cc.join(", ")}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-bold w-12 shrink-0 text-xs uppercase">Fecha:</span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {new Date(selectedEmail.createdAt).toLocaleString("es-CO", {
                        dateStyle: "full",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto bg-white dark:bg-reply-panel-dark rounded-2xl border border-gray-200 dark:border-reply-border-dark shadow-sm overflow-hidden">
                  {selectedEmail.bodyHtml ? (
                    <iframe
                      title="Email Content"
                      srcDoc={`
                        <!DOCTYPE html>
                        <html style="color-scheme: ${isDark ? "dark" : "light"};">
                        <head>
                          <style>
                            body {
                              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                              margin: 0;
                              padding: 24px;
                              color: ${isDark ? "#f3f4f6" : "#1a1a1a"};
                              background-color: transparent;
                              font-size: 14px;
                              line-height: 1.6;
                            }
                            img { max-width: 100%; height: auto; }
                            a { color: ${isDark ? "#a5b4fc" : "#4F46E5"}; }
                            table { border-collapse: collapse; }
                            /* Safeguard against dark-colored text overlays in inline html email bodies */
                            ${isDark ? `
                              p, span, div, td, font, strong, em, b, i {
                                color: #f3f4f6 !important;
                              }
                              h1, h2, h3, h4, h5, h6 {
                                color: #ffffff !important;
                              }
                            ` : ""}
                          </style>
                        </head>
                        <body>${selectedEmail.bodyHtml}</body>
                        </html>
                      `}
                      className="w-full min-h-[400px] border-0 bg-transparent"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="p-6 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {selectedEmail.bodyText || "Sin contenido disponible."}
                    </div>
                  )}
                </div>

                {/* Attachments */}
                {(() => {
                  const atts = selectedEmail.attachments;
                  if (!atts || !Array.isArray(atts) || atts.length === 0) return null;
                  const items = atts as Array<Record<string, unknown>>;
                  return (
                    <div className="mt-4 max-w-3xl mx-auto">
                      <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-2">
                        <Paperclip size={14} /> Archivos adjuntos
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {items.map((att, i) => {
                          const name = typeof att.filename === "string" ? att.filename : `Archivo ${i + 1}`;
                          return (
                            <span key={i} className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium px-3 py-2 rounded-lg">
                              <Paperclip size={12} /> {name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="p-6 bg-indigo-50 dark:bg-indigo-950/20 rounded-3xl">
                <Mail size={48} className="text-indigo-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300">
                {t("email_inbox.select_email", "Selecciona un correo")}
              </h3>
              <p className="text-sm text-gray-500 max-w-xs">
                {t("email_inbox.select_email_desc", "Haz clic en un correo de la lista para ver su contenido completo aquí.")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Compose New Email FAB */}
      <button
        onClick={() => openCompose("new")}
        className="fixed bottom-8 right-8 z-30 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-2xl shadow-xl shadow-indigo-500/30 hover:shadow-2xl active:scale-90 transition-all group"
        title="Nuevo Correo"
      >
        <Plus size={24} className="group-hover:rotate-90 transition-transform duration-200" />
      </button>

      {/* Compose Modal */}
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={handleEmailSent}
        mode={composeMode}
        replyTo={selectedEmail ? {
          from: selectedEmail.from,
          to: selectedEmail.to,
          cc: selectedEmail.cc,
          subject: selectedEmail.subject,
          bodyHtml: selectedEmail.bodyHtml,
          createdAt: selectedEmail.createdAt,
          contactId: selectedEmail.contact?.id,
        } : null}
      />
    </div>
  );
};
