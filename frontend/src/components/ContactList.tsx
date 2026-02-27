import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Contact, Channel, Tag } from "@/types";
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
  Plus,
  Minus,
} from "lucide-react";
import { ContactTimelineView } from "./crm/ContactTimelineView";
import { Avatar } from "@/components/common/Avatar";

// 🎨 100-Year Solution: Omnichannel Badge Component
// Displays the channel icon with session number for multi-account support
interface ChannelBadgeProps {
  channel: Channel | string;
  sessionIndex?: number;
  sessionPhone?: string;
  size?: "sm" | "md";
}

const ChannelBadge: React.FC<ChannelBadgeProps> = ({
  channel,
  sessionIndex,
  sessionPhone,
  size = "sm",
}) => {
  const sizeClasses = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const containerClasses =
    size === "sm"
      ? "w-[18px] h-[18px] text-[8px]"
      : "w-[22px] h-[22px] text-[9px]";

  // Channel-specific styling
  const getChannelConfig = (
    ch: Channel | string,
  ): { icon: React.ReactNode; bg: string; title: string } => {
    const normalizedChannel = String(ch).toUpperCase();

    switch (normalizedChannel) {
      case "WHATSAPP":
        return {
          icon: (
            <svg
              className={sizeClasses}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          ),
          bg: "bg-[#25D366]",
          title: sessionIndex
            ? `WhatsApp ${sessionIndex} ${sessionPhone ? `#${sessionPhone}` : ""}`
            : "WhatsApp",
        };
      case "TELEGRAM":
        return {
          icon: (
            <svg
              className={sizeClasses}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
          ),
          bg: "bg-[#0088cc]",
          title: "Telegram",
        };
      case "INSTAGRAM_DM":
        return {
          icon: (
            <svg
              className={sizeClasses}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          ),
          bg: "bg-gradient-to-tr from-[#833AB4] via-[#FD1D1D] to-[#FCB045]",
          title: "Instagram",
        };
      case "FACEBOOK_MESSENGER":
        return {
          icon: (
            <svg
              className={sizeClasses}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.301 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.259L19.752 8l-6.561 6.963z" />
            </svg>
          ),
          bg: "bg-[#0084FF]",
          title: "Messenger",
        };
      case "EMAIL":
        return {
          icon: (
            <svg
              className={sizeClasses}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          ),
          bg: "bg-gray-500",
          title: "Email",
        };
      default:
        return {
          icon: (
            <svg
              className={sizeClasses}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          ),
          bg: "bg-gray-400",
          title: "Chat",
        };
    }
  };

  const config = getChannelConfig(channel);

  return (
    <div
      className={`relative flex items-center justify-center ${containerClasses} ${config.bg} rounded-full text-white shadow-sm flex-shrink-0`}
      title={config.title}
    >
      {config.icon}
      {/* Session Number Badge (for multi-WhatsApp) */}
      {sessionIndex !== undefined && sessionIndex > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[10px] h-[10px] bg-white text-gray-800 rounded-full flex items-center justify-center font-bold shadow-sm border border-gray-200">
          {sessionIndex}
        </span>
      )}
    </div>
  );
};

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  className?: string;
}

const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  children,
  defaultOpen = false,
  count,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-100 dark:border-reply-border-dark last:border-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-reply-bg dark:hover:bg-gray-700/50 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider group-hover:text-gray-700 dark:group-hover:text-gray-300">
            {title}
          </span>
          {count !== undefined && count > 0 && (
            <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        {isOpen ? (
          <Minus className="w-3 h-3 text-gray-400 group-hover:text-indigo-500" />
        ) : (
          <Plus className="w-3 h-3 text-gray-400 group-hover:text-indigo-500" />
        )}
      </button>
      {isOpen && (
        <div
          className={`animate-in slide-in-from-top-1 fade-in duration-200 ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  );
};

interface Props {
  contacts: Contact[];
  groups?: Contact[]; // 🏢 Enterprise Grouping
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
  selectedTags?: string[];
  onToggleTag?: (tagId: string) => void;
}

const ContactListComponent: React.FC<Props> = ({
  contacts,
  groups,
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
  selectedTags = [],
  onToggleTag,
}) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [showTimelineFor, setShowTimelineFor] = React.useState<string | null>(
    null,
  );
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

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
        className="fixed z-[9999] bg-white dark:bg-reply-panel-dark p-2.5 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-600 animate-in fade-in zoom-in-95 duration-100 pointer-events-none flex flex-col gap-1.5"
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
        <div className="absolute -bottom-1 right-2 w-3 h-3 bg-white dark:bg-reply-panel-dark border-b border-r border-gray-100 dark:border-gray-600 transform rotate-45"></div>
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

      {/* Global Tooltip Portal */}
      {tooltip && (
        <TooltipPortal x={tooltip.x} y={tooltip.y} tags={tooltip.tags} />
      )}
      <div className="w-full bg-white dark:bg-reply-surface-dark border-r border-gray-200 dark:border-reply-border-dark flex flex-col h-full z-10">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-reply-border-dark bg-reply-bg dark:bg-reply-panel-dark">
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
                onClick={() =>
                  setShowTimelineFor(
                    activeContact?.realContactId || activeContactId,
                  )
                }
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
                <div className="absolute right-0 top-full mt-1 w-60 bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl border border-gray-100 dark:border-reply-border-dark z-[60] flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200 origin-top-right overflow-hidden">
                  <div className="overflow-y-auto scrollbar-thin">
                    {/* 1. FILTER TYPE */}
                    <FilterSection title="Estado" defaultOpen={true}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFilterUnread?.();
                          // setIsMenuOpen(false); // Valid to keep open for multiple selections
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-700 flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-indigo-500 pl-3"
                      >
                        <span>Solo No Leídos</span>
                        {filterUnread && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                    </FilterSection>

                    {/* 2. SORT ORDER */}
                    <FilterSection title="Orden" defaultOpen={false}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeSortOrder?.("date_desc");
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-700 flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-indigo-500 pl-3"
                      >
                        <span>Ms Recientes</span>
                        {sortOrder === "date_desc" && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeSortOrder?.("date_asc");
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-700 flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-indigo-500 pl-3"
                      >
                        <span>Ms Antiguos</span>
                        {sortOrder === "date_asc" && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                    </FilterSection>

                    {/* 3. VIEW MODE */}
                    <FilterSection title="Vista" defaultOpen={false}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeViewMode?.("comfortable");
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-700 flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-indigo-500 pl-3"
                      >
                        <span>Cómoda</span>
                        {viewMode === "comfortable" && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeViewMode?.("compact");
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-700 flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-indigo-500 pl-3"
                      >
                        <span>Compacta</span>
                        {viewMode === "compact" && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                    </FilterSection>

                    {/* 4. TAGS (Scrollable) */}
                    {allTags.length > 0 && onToggleTag && (
                      <FilterSection
                        title="Etiquetas"
                        count={selectedTags.length}
                        defaultOpen={selectedTags.length > 0}
                        className="max-h-64 overflow-y-auto scrollbar-thin pb-2"
                      >
                        {/* Search could be added here later */}
                        {allTags.map((tag) => {
                          const isSelected = selectedTags.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleTag(tag.id);
                              }}
                              className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between transition-colors group ${isSelected ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300" : "text-gray-600 dark:text-gray-300 hover:bg-reply-bg dark:hover:bg-gray-700"}`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-2.5 h-2.5 rounded-full ${tag.color.replace("text-", "bg-").replace("text-white", "")} shadow-sm border border-black/5 flex-shrink-0`}
                                ></div>
                                <span className="truncate flex-1 max-w-[180px]">
                                  {tag.name}
                                </span>
                              </div>
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </FilterSection>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 bg-white dark:bg-reply-surface-dark border-b border-gray-100 dark:border-reply-border-dark">
          <div className="bg-gray-100 dark:bg-reply-panel-dark rounded-lg px-4 py-2 flex items-center gap-3 border border-transparent focus-within:border-green-500 dark:focus-within:border-green-500 transition-all">
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
          {/* Section: Direct Messages */}
          {groups && groups.length > 0 && contacts.length > 0 && (
            <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-reply-bg/80 dark:bg-reply-surface-dark/80 backdrop-blur sticky top-0 z-10 border-b border-gray-100 dark:border-reply-border-dark">
              Mensajes Directos ({contacts.length})
            </div>
          )}

          {contacts.map((contact) => {
            const isActive = activeContactId === contact.id;
            const isDeleting = deletingId === contact.id;

            return (
              <div
                key={contact.id}
                onClick={() => !isDeleting && onSelectContact(contact.id)}
                className={`flex items-start gap-2.5 cursor-pointer transition-all relative group border-b border-gray-100 dark:border-reply-border-dark dark:hover:bg-reply-panel-dark hover:bg-reply-bg 
                ${viewMode === "compact" ? "py-1.5 px-2" : "py-2 px-3"}
                ${
                  isActive
                    ? "bg-gray-100 dark:bg-reply-border-dark border-l-4 border-l-green-500"
                    : "bg-white dark:bg-reply-surface-dark border-l-4 border-l-transparent"
                }
                ${isDeleting ? "opacity-50 pointer-events-none" : ""}
              `}
              >
                {/* 100-Year UI: Delete Button relocated to ABSOLUTE top-left to maximize space */}
                {(userRole === "ADMIN" || userRole === "company_admin") &&
                  onDeleteContact && (
                    <button
                      onClick={(e) => handleDelete(e, contact.id)}
                      disabled={!!deletingId}
                      className="absolute bottom-0 left-0 p-1.5 opacity-0 group-hover:opacity-100 transition-all text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-transparent dark:hover:bg-transparent z-20"
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
                  <Avatar
                    src={contact.profilePicUrl || contact.avatarUrl || null}
                    name={contact.name || ""}
                    className={`${viewMode === "compact" ? "w-8 h-8 text-xs" : "w-10 h-10 text-xs"} shadow-sm`}
                  />
                  {/* Bot Indicator */}
                  {contact.assignedMode === "bot" && (
                    <div
                      className={`absolute -bottom-1 -right-1 bg-blue-500 dark:bg-blue-600 rounded-full border-2 border-white dark:border-reply-border-dark ${viewMode === "compact" ? "p-0.5" : "p-0.5"}`}
                      title="Atendido por Bot"
                    >
                      <Bot
                        className={`${viewMode === "compact" ? "w-2 h-2" : "w-3 h-3"} text-white`}
                      />
                    </div>
                  )}
                  {/* Group Indicator (New) */}
                  {contact.isGroup && (
                    <div
                      className="absolute -top-1 -right-1 bg-orange-500 rounded-full border-2 border-white dark:border-reply-border-dark p-0.5"
                      title="Grupo"
                    >
                      <User className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  {/* Row 1: Name + Time */}
                  <div className="flex justify-between items-center gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* 📱 Channel Badge (WhatsApp #1, #2, etc.) */}
                      {contact.channel && (
                        <ChannelBadge
                          channel={contact.channel}
                          sessionIndex={contact.whatsappSessionIndex}
                          sessionPhone={contact.whatsappSessionPhone}
                          size="sm"
                        />
                      )}
                      <h3
                        className={`font-semibold truncate text-gray-900 dark:text-white ${viewMode === "compact" ? "text-xs" : "text-sm"}`}
                      >
                        {contact.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {contact.unreadCount > 0 && (
                        <span className="bg-green-500 dark:bg-green-600 text-white text-[9px] font-bold px-1.5 min-w-[1rem] h-4 rounded-full flex items-center justify-center shadow-sm">
                          {contact.unreadCount}
                        </span>
                      )}
                      <span
                        className={`text-[10px] ${contact.unreadCount > 0 ? "text-green-500 dark:text-green-400 font-bold" : "text-gray-400 dark:text-gray-500"}`}
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
                  </div>

                  {/* Row 2: Message + Tags (inline) */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`truncate flex-1 text-gray-500 dark:text-gray-400 ${viewMode === "compact" ? "text-[11px]" : "text-xs"}`}
                    >
                      {contact.lastMessage}
                    </span>
                    {/* Inline Tags */}
                    {viewMode !== "compact" &&
                      (contact.tags?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {(() => {
                            const tags = contact.tags || [];
                            const MAX_VISIBLE = 2;
                            const visibleTagIds = tags.slice(0, MAX_VISIBLE);
                            const hiddenCount = tags.length - MAX_VISIBLE;

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
                                      className={`text-[8px] px-1 py-0.5 rounded font-bold truncate max-w-[50px] ${tag.color}`}
                                      title={tag.name}
                                    >
                                      {tag.name}
                                    </span>
                                  );
                                })}
                                {hiddenCount > 0 && (
                                  <span
                                    className="text-[8px] px-1 py-0.5 rounded font-bold bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                                    onMouseEnter={(e) => {
                                      const rect =
                                        e.currentTarget.getBoundingClientRect();
                                      setTooltip({
                                        x: rect.right,
                                        y: rect.top,
                                        tags: tags.slice(MAX_VISIBLE),
                                      });
                                    }}
                                    onMouseLeave={() => setTooltip(null)}
                                  >
                                    +{hiddenCount}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                  </div>

                  {/* Row 3: Agent/Queue (compact inline) */}
                  {viewMode !== "compact" &&
                    (contact.assignedAgentName || contact.queueName) && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {contact.assignedAgentName && (
                          <span
                            className="text-[9px] text-blue-500 dark:text-blue-400 flex items-center gap-0.5"
                            title="Agente"
                          >
                            <User className="w-2.5 h-2.5" />
                            {contact.assignedAgentName}
                          </span>
                        )}
                        {contact.queueName && (
                          <span
                            className="text-[9px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5"
                            title="Cola"
                          >
                            <Layers className="w-2.5 h-2.5" />
                            {contact.queueName}
                          </span>
                        )}
                      </div>
                    )}
                </div>
              </div>
            );
          })}

          {/* Section: Groups */}
          {groups && groups.length > 0 && (
            <>
              <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-reply-bg/80 dark:bg-reply-surface-dark/80 backdrop-blur sticky top-0 z-10 border-b border-gray-100 dark:border-reply-border-dark border-t">
                Grupos de Trabajo ({groups.length})
              </div>
              {groups.map((contact) => {
                const isActive = activeContactId === contact.id;
                const isDeleting = deletingId === contact.id;
                return (
                  <div
                    key={contact.id}
                    onClick={() => !isDeleting && onSelectContact(contact.id)}
                    className={`flex items-start gap-2.5 cursor-pointer transition-all relative group border-b border-gray-100 dark:border-reply-border-dark dark:hover:bg-reply-panel-dark hover:bg-reply-bg 
                    ${viewMode === "compact" ? "py-1.5 px-2" : "py-2 px-3"}
                    ${isActive ? "bg-gray-100 dark:bg-reply-border-dark border-l-4 border-l-green-500" : "bg-white dark:bg-reply-surface-dark border-l-4 border-l-transparent"}
                    ${isDeleting ? "opacity-50 pointer-events-none" : ""}
                  `}
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar
                        src={contact.profilePicUrl || contact.avatarUrl || null}
                        name={contact.name || ""}
                        className={`${viewMode === "compact" ? "w-8 h-8 text-xs" : "w-10 h-10 text-xs"} shadow-sm`}
                      />
                      <div className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-800 rounded-full border border-gray-100 p-0.5">
                        <User className="w-3 h-3 text-orange-500" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex justify-between items-center gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {contact.channel && (
                            <ChannelBadge
                              channel={contact.channel}
                              sessionIndex={contact.whatsappSessionIndex}
                              sessionPhone={contact.whatsappSessionPhone}
                              size="sm"
                            />
                          )}
                          <h3 className="font-semibold truncate text-gray-900 dark:text-white text-sm">
                            {contact.name}
                          </h3>
                        </div>
                        <span className="text-xs text-gray-400">
                          {contact.lastMessageTime
                            ? new Date(
                                contact.lastMessageTime,
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {contact.lastMessage}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export const ContactList = React.memo(ContactListComponent);
