import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Contact, Tag } from "@/types";
import {
  History,
  PlusCircle,
  ListFilter,
  Check,
  Search,
  MessageSquare,
  X,
  Archive,
  User,
} from "lucide-react";
import { ContactTimelineView } from "../crm/ContactTimelineView";
import { FilterSection } from "./FilterSection";
import { ContactRow } from "./ContactRow";
import { GroupRow } from "./GroupRow";

interface Props {
  contacts: Contact[];
  groups?: Contact[]; //  Enterprise Grouping
  activeContactId: string;
  onSelectContact: (id: string) => void;
  userRole?: string;
  onDeleteContact?: (id: string) => void;
  onNewChat?: () => void;
  allTags?: Tag[];

  // New Props for Menu
  filterUnread?: boolean;
  onToggleFilterUnread?: () => void;
  showArchived?: boolean;
  archivedCount?: number;
  onToggleShowArchived?: () => void;
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
  showArchived = false,
  archivedCount = 0,
  onToggleShowArchived,
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
  const [searchTerm, setSearchTerm] = React.useState("");

  const menuRef = React.useRef<HTMLDivElement>(null);

  // 100-Year Solution: Portal Tooltip State
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    tags: string[];
  } | null>(null);

  const { t } = useTranslation();

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
          {t("contact_list.hidden_tags", "Etiquetas Ocultas")}
        </div>
        <div className="flex flex-wrap gap-1 max-w-[180px]">
          {tags.map((id) => {
            const tag = allTags.find((tg) => tg.id === id);
            if (!tag) return null;
            return (
              <span
                key={id}
                className={`text-[9px] px-2 py-0.5 rounded shadow-sm font-bold text-white ${tag.color}`}
              >
                {tag.name}
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
    console.info("[ContactList] Delete initiated for:", contactId);

    // We don't await because the prop is void, but we expect the parent
    // to remove the item from the list, which will unmount this row.
    // If it fails, we should ideally unset it, but for now this prevents 404 race.
    onDeleteContact?.(contactId);

    // Safety timeout in case parent doesn't remove it (API fail)
    setTimeout(() => {
      setDeletingId((prev) => (prev === contactId ? null : prev));
    }, 4000);
  };

  const handleTagOverflowHover = (e: React.MouseEvent, tags: string[]) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ x: rect.right, y: rect.top, tags });
  };
  const handleTagOverflowLeave = () => setTooltip(null);

  const activeContact = contacts.find((c) => c.id === activeContactId);

  // Diacritic-insensitive matcher so "Muñoz" is found typing "munoz" and
  // vice versa (Spanish-heavy dataset). Matches across every visible field
  // of the row: name, phone/channelId, last message, queue, and agent.
  const normalizeText = (value: string): string =>
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  const matchesSearch = React.useCallback(
    (contact: Contact, needle: string): boolean => {
      const haystack = normalizeText(
        [
          contact.name,
          contact.phone,
          contact.channelId,
          contact.lastMessage,
          contact.queueName,
          contact.assignedAgentName,
        ]
          .filter(Boolean)
          .join(" "),
      );
      return haystack.includes(needle);
    },
    [],
  );

  const normalizedSearch = normalizeText(searchTerm.trim());
  const filteredContacts = useMemo(
    () =>
      normalizedSearch
        ? contacts.filter((c) => matchesSearch(c, normalizedSearch))
        : contacts,
    [contacts, normalizedSearch, matchesSearch],
  );
  const filteredGroups = useMemo(
    () =>
      normalizedSearch
        ? (groups || []).filter((c) => matchesSearch(c, normalizedSearch))
        : groups || [],
    [groups, normalizedSearch, matchesSearch],
  );
  const hasNoResults =
    !!normalizedSearch && filteredContacts.length === 0 && filteredGroups.length === 0;

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
              {t("contact_list.my_inbox", "Mi Bandeja")}
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
                title={t("contact_list.view_history", "Ver Historial")}
                className="hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors text-blue-500"
              >
                <History className="w-5 h-5" />
              </button>
            )}
            {onNewChat && (
              <button
                onClick={onNewChat}
                title={t("contact_list.new_chat", "Nuevo Chat")}
                className="hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
              >
                <PlusCircle className="w-5 h-5" />
              </button>
            )}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                title={t("contact_list.filters", "Filtros")}
                className={`hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors ${isMenuOpen ? "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white" : ""}`}
              >
                <ListFilter className="w-5 h-5" />
              </button>

              {/* Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-60 bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl border border-gray-100 dark:border-reply-border-dark z-[60] flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200 origin-top-right overflow-hidden">
                  <div className="overflow-y-auto scrollbar-thin">
                    {/* 1. FILTER TYPE */}
                    <FilterSection title={t("contact_list.status", "Estado")} defaultOpen={true}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFilterUnread?.();
                          // setIsMenuOpen(false); // Valid to keep open for multiple selections
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-700 flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-indigo-500 pl-3"
                      >
                        <span>{t("contact_list.unread_only", "Solo No Leídos")}</span>
                        {filterUnread && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                    </FilterSection>

                    {/* 2. SORT ORDER */}
                    <FilterSection title={t("contact_list.order", "Orden")} defaultOpen={false}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeSortOrder?.("date_desc");
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-700 flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-indigo-500 pl-3"
                      >
                        <span>{t("contact_list.most_recent", "Ms Recientes")}</span>
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
                        <span>{t("contact_list.oldest", "Ms Antiguos")}</span>
                        {sortOrder === "date_asc" && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                    </FilterSection>

                    {/* 3. VIEW MODE */}
                    <FilterSection title={t("contact_list.view", "Vista")} defaultOpen={false}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeViewMode?.("comfortable");
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-reply-bg dark:hover:bg-gray-700 flex items-center justify-between transition-colors border-l-2 border-transparent hover:border-indigo-500 pl-3"
                      >
                        <span>{t("contact_list.comfortable", "Cómoda")}</span>
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
                        <span>{t("contact_list.compact", "Compacta")}</span>
                        {viewMode === "compact" && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </button>
                    </FilterSection>

                    {/* 4. TAGS (Scrollable) */}
                    {allTags.length > 0 && onToggleTag && (
                      <FilterSection
                        title={t("contact_list.tags", "Etiquetas")}
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
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchTerm("");
              }}
              placeholder={t("contact_list.search_placeholder", "Buscar o iniciar chat...")}
              className="bg-transparent text-sm w-full focus:outline-none placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                title={t("common.cancel", "Cancelar")}
                className="shrink-0 p-0.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Archived folder toggle (WhatsApp-style) — shown when there are
            archived chats, or while viewing the archive so you can exit it. */}
        {onToggleShowArchived && (showArchived || archivedCount > 0) && (
          <button
            onClick={onToggleShowArchived}
            className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-reply-border-dark transition-colors ${
              showArchived
                ? "bg-green-50 dark:bg-green-900/15 text-green-700 dark:text-green-400"
                : "hover:bg-gray-50 dark:hover:bg-white/5 text-gray-600 dark:text-gray-300"
            }`}
          >
            <Archive className={`w-4 h-4 shrink-0 ${showArchived ? "text-green-600 dark:text-green-400" : "text-gray-400"}`} />
            <span className="text-sm font-semibold flex-1 text-left">
              {showArchived
                ? t("contact_list.back_to_chats", "Volver a los chats")
                : t("contact_list.archived", "Archivados")}
            </span>
            {!showArchived && archivedCount > 0 && (
              <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500">
                {archivedCount}
              </span>
            )}
          </button>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Archive empty state */}
          {showArchived && filteredContacts.length === 0 && filteredGroups.length === 0 && !hasNoResults && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <Archive className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t("contact_list.no_archived", "No hay chats archivados")}
              </p>
            </div>
          )}

          {/* Empty search state */}
          {hasNoResults && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t("contact_list.no_contacts", "No se encontraron contactos")}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 break-all">
                "{searchTerm}"
              </p>
            </div>
          )}

          {/* Section: Direct Messages */}
          {filteredGroups.length > 0 && filteredContacts.length > 0 && (
            <div className="px-4 py-2.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider bg-indigo-50/50 dark:bg-indigo-900/10 backdrop-blur sticky top-0 z-10 border-b border-indigo-100/50 dark:border-indigo-900/20 flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center">
                <MessageSquare className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <span>{t("contact_list.direct_messages", "Mensajes Directos")}</span>
              <span className="ml-auto bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                {filteredContacts.length}
              </span>
            </div>
          )}

          {filteredContacts.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              isActive={activeContactId === contact.id}
              isDeleting={deletingId === contact.id}
              deletingId={deletingId}
              viewMode={viewMode}
              userRole={userRole}
              allTags={allTags}
              onSelectContact={onSelectContact}
              onDelete={onDeleteContact ? handleDelete : undefined}
              onTagOverflowHover={handleTagOverflowHover}
              onTagOverflowLeave={handleTagOverflowLeave}
            />
          ))}

          {/* Section: Groups */}
          {filteredGroups.length > 0 && (
            <>
              <div className="px-4 py-2.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider bg-emerald-50/50 dark:bg-emerald-900/10 backdrop-blur sticky top-0 z-10 border-y border-emerald-100/50 dark:border-emerald-900/20 flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                  <User className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span>{t("contact_list.work_groups", "Grupos de Trabajo")}</span>
                <span className="ml-auto bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                  {filteredGroups.length}
                </span>
              </div>
              {filteredGroups.map((contact) => (
                <GroupRow
                  key={contact.id}
                  contact={contact}
                  isActive={activeContactId === contact.id}
                  isDeleting={deletingId === contact.id}
                  deletingId={deletingId}
                  viewMode={viewMode}
                  userRole={userRole}
                  onSelectContact={onSelectContact}
                  onDelete={onDeleteContact ? handleDelete : undefined}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export const ContactList = React.memo(ContactListComponent);
