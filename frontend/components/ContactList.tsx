import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Contact, Channel, Tag } from "../types";
import {
  History,
  PlusCircle,
  ListFilter,
  Check,
  Search,
  Bot,
  Layers,
  User,
  Loader2,
  Trash2,
} from "lucide-react";
import { ContactTimelineView } from "./crm/ContactTimelineView";
import { ImageLightbox } from "./ImageLightbox";

interface Props {
  contacts: Contact[];
  activeContactId: string;
  onSelectContact: (id: string) => void;
  userRole?: string;
  onDeleteContact?: (id: string) => void;
  onNewChat?: () => void;
  allTags?: Tag[];

  // New Props for Menu
  filterUnread?: boolean;
  onToggleFilterUnread?: () => void;
  sortOrder?: "date_desc" | "date_asc";
  onChangeSortOrder?: (order: "date_desc" | "date_asc") => void;
  viewMode?: "compact" | "comfortable";
  onChangeViewMode?: (mode: "compact" | "comfortable") => void;
}

export const ContactList: React.FC<Props> = ({
  contacts,
  activeContactId,
  onSelectContact,
  userRole,
  onDeleteContact,
  onNewChat,
  allTags = [],
  filterUnread = false,
  onToggleFilterUnread,
  sortOrder = "date_desc",
  onChangeSortOrder,
  viewMode = "comfortable",
  onChangeViewMode,
}) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [showTimelineFor, setShowTimelineFor] = React.useState<string | null>(
    null,
  );
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = React.useState<{
    url: string;
    alt: string;
  } | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // 100-Year Solution: Portal Tooltip State
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    tags: string[];
  } | null>(null);

  const TooltipPortal = ({
    x,
    y,
    tags,
  }: {
    x: number;
    y: number;
    tags: string[];
  }) => {
    return createPortal(
      <div
        className="fixed z-[9999] bg-white dark:bg-[#1f2937] p-2.5 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-600 animate-in fade-in zoom-in-95 duration-100 pointer-events-none flex flex-col gap-1.5"
        style={{
          left: x,
          top: y,
          transform: "translate(-100%, -100%)", // Position Top-Left relative to cursor/badge
          marginTop: "-8px",
        }}
      >
        <div className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider mb-0.5 px-0.5 border-b border-gray-100 dark:border-gray-600 pb-1">
          Etiquetas Ocultas
        </div>
        <div className="flex flex-wrap gap-1 max-w-[180px]">
          {tags.map((id) => {
            const t = allTags.find((tag) => tag.id === id);
            if (!t) return null;
            return (
              <span
                key={id}
                className={`text-[9px] px-2 py-0.5 rounded shadow-sm font-bold text-white ${t.color}`}
              >
                {t.name}
              </span>
            );
          })}
        </div>
        <div className="absolute -bottom-1 right-2 w-3 h-3 bg-white dark:bg-[#1f2937] border-b border-r border-gray-100 dark:border-gray-600 transform rotate-45"></div>
      </div>,
      document.body,
    );
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDelete = async (e: React.MouseEvent, contactId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (deletingId) return; // Prevent double click

    setDeletingId(contactId); // Lock UI immediately
    console.log("[ContactList] 🗑️  Delete initiated for:", contactId);

    // We don't await because the prop is void, but we expect the parent
    // to remove the item from the list, which will unmount this row.
    // If it fails, we should ideally unset it, but for now this prevents 404 race.
    onDeleteContact?.(contactId);

    // Safety timeout in case parent doesn't remove it (API fail)
    setTimeout(() => {
      setDeletingId((prev) => (prev === contactId ? null : prev));
    }, 4000);
  };

  const activeContact = contacts.find((c) => c.id === activeContactId);

  return (
    <>
      {showTimelineFor && (
        <ContactTimelineView
          contactId={showTimelineFor}
          onClose={() => setShowTimelineFor(null)}
        />
      )}
      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage.url}
          alt={lightboxImage.alt}
          onClose={() => setLightboxImage(null)}
        />
      )}
      {/* Global Tooltip Portal */}
      {tooltip && (
        <TooltipPortal x={tooltip.x} y={tooltip.y} tags={tooltip.tags} />
      )}
      <div className="w-full bg-white dark:bg-[#111b21] border-r border-gray-200 dark:border-gray-700 flex flex-col h-full z-10">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#202c33]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs ring-2 ring-white dark:ring-gray-700">
              MB
            </div>
            <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">
              Mi Bandeja
            </span>
          </div>
          <div className="flex gap-1 text-gray-500 dark:text-gray-400">
            {activeContactId && (
              <button
                onClick={() => setShowTimelineFor(activeContactId)}
                title="Ver Historial"
                className="hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors text-blue-500"
              >
                <History className="w-5 h-5" />
              </button>
            )}
            {onNewChat && (
              <button
                onClick={onNewChat}
                title="Nuevo Chat"
                className="hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            )}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                title="Filtros"
                className={`hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors ${isMenuOpen ? "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white" : ""}`}
              >
                <ListFilter className="w-5 h-5" />
              </button>

              {/* Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#202c33] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="py-2">
                    <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Filtros
                    </div>
                    <button
                      onClick={() => {
                        onToggleFilterUnread?.();
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
                    >
                      <span>Solo No Leídos</span>
                      {filterUnread && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </button>

                    <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                    <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Orden
                    </div>
                    <button
                      onClick={() => {
                        onChangeSortOrder?.("date_desc");
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
                    >
                      <span>Más Recientes</span>
                      {sortOrder === "date_desc" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        onChangeSortOrder?.("date_asc");
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
                    >
                      <span>Más Antiguos</span>
                      {sortOrder === "date_asc" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </button>

                    <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                    <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Vista
                    </div>
                    <button
                      onClick={() => {
                        onChangeViewMode?.("comfortable");
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
                    >
                      <span>Cómoda</span>
                      {viewMode === "comfortable" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        onChangeViewMode?.("compact");
                        setIsMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
                    >
                      <span>Compacta</span>
                      {viewMode === "compact" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 bg-white dark:bg-[#111b21] border-b border-gray-100 dark:border-gray-800">
          <div className="bg-gray-100 dark:bg-[#202c33] rounded-lg px-4 py-2 flex items-center gap-3 border border-transparent focus-within:border-green-500 dark:focus-within:border-green-500 transition-all">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar o iniciar chat..."
              className="bg-transparent text-sm w-full focus:outline-none placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white font-medium"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {contacts.map((contact) => {
            const isActive = activeContactId === contact.id;
            const isDeleting = deletingId === contact.id;

            return (
              <div
                key={contact.id}
                onClick={() => !isDeleting && onSelectContact(contact.id)}
                className={`flex items-center gap-3 cursor-pointer transition-all relative group border-b border-gray-100 dark:border-gray-800 dark:hover:bg-[#202c33] hover:bg-gray-50 
                ${viewMode === "compact" ? "p-2" : "p-3.5"}
                ${
                  isActive
                    ? "bg-gray-100 dark:bg-[#2a3942] border-l-4 border-l-green-500"
                    : "bg-white dark:bg-[#111b21] border-l-4 border-l-transparent"
                }
                ${isDeleting ? "opacity-50 pointer-events-none" : ""}
              `}
              >
                {/* 100-Year UI: Delete Button relocated to left to avoid Tag overlap */}
                {/* 100-Year UI: Delete Button relocated to ABSOLUTE top-left to maximize space */}
                {(userRole === "ADMIN" || userRole === "company_admin") &&
                  onDeleteContact && (
                    <button
                      onClick={(e) => handleDelete(e, contact.id)}
                      disabled={!!deletingId}
                      className="absolute top-0.5 left-0.5 p-1.5 opacity-0 group-hover:opacity-100 transition-all text-gray-400 hover:text-red-500 hover:bg-red-50 dark:text-gray-600 dark:hover:text-red-400 dark:hover:bg-red-900/20 rounded-md z-20"
                      title="Eliminar ticket"
                    >
                      {isDeleting ? (
                        <Loader2 className="animate-spin h-3 w-3 text-red-500" />
                      ) : (
                        <Trash2 className="w-3 w-3" />
                      )}
                    </button>
                  )}

                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {contact.profilePicUrl || contact.avatarUrl ? (
                    <img
                      src={contact.profilePicUrl || contact.avatarUrl}
                      alt={contact.name}
                      className={`${viewMode === "compact" ? "w-8 h-8" : "w-12 h-12"} rounded-full object-cover shadow-sm transition-all cursor-pointer hover:opacity-80 hover:ring-2 hover:ring-reply-green`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxImage({
                          url: contact.profilePicUrl || contact.avatarUrl!,
                          alt: contact.name,
                        });
                      }}
                      onError={(e) => {
                        // Fallback to initials if image fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        const fallback =
                          target.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                  ) : null}
                  {/* Fallback: Initials Circle */}
                  <div
                    className={`${viewMode === "compact" ? "w-8 h-8 text-xs" : "w-12 h-12 text-sm"} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm`}
                    style={{
                      display:
                        contact.profilePicUrl || contact.avatarUrl
                          ? "none"
                          : "flex",
                    }}
                  >
                    {contact.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                  {contact.assignedMode === "bot" && (
                    <div
                      className={`absolute -bottom-1 -right-1 bg-blue-500 dark:bg-blue-600 rounded-full border-2 border-white dark:border-gray-800 ${viewMode === "compact" ? "p-0.5" : "p-0.5"}`}
                      title="Atendido por Bot"
                    >
                      <Bot
                        className={`${viewMode === "compact" ? "w-2 h-2" : "w-3 h-3"} text-white`}
                      />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="flex justify-between items-center">
                    <h3
                      className={`font-semibold truncate ${isActive ? "text-gray-900 dark:text-white" : "text-gray-900 dark:text-white"} ${viewMode === "compact" ? "text-sm" : "text-base"}`}
                    >
                      {contact.name}
                    </h3>
                    <span
                      className={`text-xs ${contact.unreadCount > 0 ? "text-green-500 dark:text-green-400 font-bold" : "text-gray-400 dark:text-gray-500"}`}
                    >
                      {(() => {
                        try {
                          if (!contact.lastMessageTime) return "";
                          const date = new Date(contact.lastMessageTime);
                          return isNaN(date.getTime())
                            ? ""
                            : date.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                        } catch (e) {
                          return "";
                        }
                      })()}
                    </span>
                  </div>
                  <div
                    className={`flex justify-between items-center ${viewMode === "compact" ? "mt-0.5" : "mt-1"}`}
                  >
                    <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 truncate pr-2 w-full">
                      <span className="truncate">{contact.lastMessage}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {viewMode !== "compact" && (
                        <div className="flex flex-wrap justify-end gap-1 max-w-[120px]">
                          {(() => {
                            // 100-Year Solution: Robust display logic with overflow handling
                            const tags = contact.tags || [];
                            const MAX_VISIBLE = 2; // Clean limit for mobile/list views
                            const visibleTagIds = tags.slice(0, MAX_VISIBLE);
                            const hiddenTagIds = tags.slice(MAX_VISIBLE);
                            const hasOverflow = hiddenTagIds.length > 0;

                            return (
                              <>
                                {visibleTagIds.map((tagId) => {
                                  const tag = allTags.find(
                                    (t) => t.id === tagId,
                                  );
                                  if (!tag) return null;
                                  return (
                                    <span
                                      key={tagId}
                                      className={`text-[9px] px-1.5 py-0.5 rounded shadow-sm font-bold truncate max-w-[80px] ${tag.color}`}
                                      title={tag.name}
                                    >
                                      {tag.name}
                                    </span>
                                  );
                                })}

                                {hasOverflow && (
                                  <div
                                    className="relative group"
                                    onMouseEnter={(e) => {
                                      const rect =
                                        e.currentTarget.getBoundingClientRect();
                                      setTooltip({
                                        x: rect.right,
                                        y: rect.top,
                                        tags: hiddenTagIds,
                                      });
                                    }}
                                    onMouseLeave={() => setTooltip(null)}
                                  >
                                    <span className="text-[9px] px-1.5 py-0.5 rounded shadow-sm font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-help">
                                      +{hiddenTagIds.length}
                                    </span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                      {contact.unreadCount > 0 && (
                        <span className="bg-green-500 dark:bg-green-600 text-white text-[10px] font-bold px-1.5 min-w-[1.25rem] h-5 rounded-full flex items-center justify-center shadow-sm">
                          {contact.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Context Info */}
                  {viewMode !== "compact" && (
                    <div className="flex items-center gap-2 mt-1.5">
                      {contact.queueName && (
                        <span
                          className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 font-medium border border-gray-200 dark:border-gray-600"
                          title="Cola"
                        >
                          <Layers className="w-3 h-3" />
                          {contact.queueName}
                        </span>
                      )}
                      {contact.assignedAgentName && (
                        <span
                          className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-[9px] flex items-center gap-1 font-medium border border-blue-100 dark:border-blue-800"
                          title="Agente Asignado"
                        >
                          <User className="w-3 h-3" />
                          {contact.assignedAgentName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
