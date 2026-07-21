import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Contact, Tag } from "@/types";
import { ModuleHeader } from "@/components/common/ModuleHeader";
import { ContactTimelineView } from "@/components/crm/ContactTimelineView";
import { EmailModal } from "@/components/EmailModal";
import { API_BASE_URL } from "@/services/apiConfig";
import { useNavigate } from "react-router-dom";
import { Search, User, History, Trash2, X, MessageSquare } from "lucide-react";
import { Skeleton } from "boneyard-js/react";
import { ContactFormModal } from "@/components/contacts/ContactFormModal";
import { getModuleCache, setModuleCache } from "@/lib/moduleCache";

interface ContactsCache {
  contacts: Contact[];
  totalPages: number;
  totalResults: number;
}

const CONTACTS_CACHE_KEY = "contacts:default-view";

export const ContactsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Stale-while-revalidate: render the last default view (page 1, no search)
  // instantly on re-entry and refetch silently, instead of flashing the
  // skeleton on every module switch.
  const cached = getModuleCache<ContactsCache>(CONTACTS_CACHE_KEY);
  const [contacts, setContacts] = useState<Contact[]>(cached?.contacts ?? []);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(!cached);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(cached?.totalPages ?? 1);
  const [totalResults, setTotalResults] = useState(cached?.totalResults ?? 0);
  const [limit] = useState(50); // Default items per page

  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineContactId, setTimelineContactId] = useState<string | null>(null);

  // Email State
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedEmailContact, setSelectedEmailContact] =
    useState<Contact | null>(null);

  // Form State handled by ContactFormModal

  // WhatsApp contact import control (manual / opt-in)
  const [autoImportWa, setAutoImportWa] = useState(false);
  const [savingAutoImport, setSavingAutoImport] = useState(false);
  const [importingWa, setImportingWa] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to first page on search
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    fetchContacts(page, debouncedSearch);
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchTags();
    fetchAutoImportSetting();
  }, []);

  const fetchAutoImportSetting = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/company/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const settings = data.data || data;
      setAutoImportWa(settings?.whatsappSync?.autoImportContacts === true);
    } catch (error) {
      console.error("Error fetching WhatsApp import setting:", error);
    }
  };

  const handleToggleAutoImport = async () => {
    const next = !autoImportWa;
    setSavingAutoImport(true);
    setAutoImportWa(next); // optimistic
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/company/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ whatsappSync: { autoImportContacts: next } }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success(
        next
          ? t("contacts_page.toast.auto_sync_enabled", "Sincronización automática activada")
          : t("contacts_page.toast.auto_sync_disabled", "Sincronización automática desactivada"),
      );
    } catch (error) {
      console.error("Error saving auto-import setting:", error);
      setAutoImportWa(!next); // revert
      toast.error(t("contacts_page.toast.save_preference_error", "Error al guardar preferencia"));
    } finally {
      setSavingAutoImport(false);
    }
  };

  const handleImportWhatsApp = async () => {
    setImportingWa(true);
    const toastId = toast.loading(t("contacts_page.toast.importing", "Importando contactos…"));
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/company/import-whatsapp-contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t("contacts_page.toast.import_error", "Error al importar contactos"));
      }
      const r = data.data || data;
      toast.success(
        t("contacts_page.toast.import_summary", "{{imported}} importados · {{skipped}} omitidos", { imported: r.imported, skipped: r.skipped }),
        { id: toastId },
      );
      await fetchContacts(page, debouncedSearch);
    } catch (error: unknown) {
      console.error("Error importing WhatsApp contacts:", error);
      const msg = error instanceof Error ? error.message : t("contacts_page.toast.import_error", "Error al importar contactos");
      toast.error(msg, { id: toastId });
    } finally {
      setImportingWa(false);
    }
  };

  const fetchTags = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/tags`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      // Robust handling: Check if array directly, or nested in data.data
      const tagsData = Array.isArray(data)
        ? data
        : Array.isArray(data.data)
          ? data.data
          : [];
      
      setAllTags(tagsData);
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  };

  const fetchContacts = async (pageNum: number, search: string) => {
    const isDefaultView = pageNum === 1 && !search;
    // Only show the skeleton when there's nothing to render underneath —
    // a cached default view revalidates silently in the background.
    if (!(isDefaultView && getModuleCache<ContactsCache>(CONTACTS_CACHE_KEY))) {
      setLoading(true);
    }
    try {
      const token = localStorage.getItem("token");
      const offset = (pageNum - 1) * limit;
      const url = new URL(`${API_BASE_URL}/contacts`);
      url.searchParams.append("limit", limit.toString());
      url.searchParams.append("offset", offset.toString());
      if (search) url.searchParams.append("search", search);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.status === "success") {
        const list: Contact[] = Array.isArray(data.data) ? data.data : data.data?.contacts || [];
        setContacts(list);

        // Handle standardized meta or legacy results field
        let pages = 1;
        let total = list.length;
        if (data.meta) {
          pages = data.meta.pages || 1;
          total = data.meta.total || 0;
        } else if (typeof data.results === "number") {
          total = data.results;
          pages = Math.ceil(data.results / limit);
        }
        setTotalPages(pages);
        setTotalResults(total);
        if (isDefaultView) {
          setModuleCache<ContactsCache>(CONTACTS_CACHE_KEY, {
            contacts: list,
            totalPages: pages,
            totalResults: total,
          });
        }
      } else if (Array.isArray(data)) {
        setContacts(data);
        setTotalResults(data.length);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (contact?: Contact) => {
    if (contact) {
      const isFakeEmail =
        contact.email?.includes("@whatsapp.user") ||
        contact.email?.includes("@c.us");
      const cleanEmail = isFakeEmail ? "" : contact.email || "";

      let displayPhone = contact.phone || "";
      if (!displayPhone && isFakeEmail) {
        displayPhone = contact.email?.split("@")[0] || "";
      }

      const cleanName =
        contact.name === "Unknown Contact" || contact.name === displayPhone
          ? ""
          : contact.name;

      setEditingContact({
        ...contact,
        name: cleanName,
        email: cleanEmail,
        phone: displayPhone,
      });
    } else {
      setEditingContact(null);
    }
    setShowModal(true);
  };

  const handleSaveContact = async (contactData: {
    name: string;
    email: string;
    phone: string;
    tagIds: string[];
    notes: string;
  }) => {
    try {
      const token = localStorage.getItem("token");
      const url = `${API_BASE_URL}/contacts`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingContact?.id,
          name: contactData.name,
          email: contactData.email,
          phone: contactData.phone,
          tags: contactData.tagIds,
          notes: contactData.notes,
        }),
      });

      if (res.ok) {
        toast.success(
          editingContact
            ? t("queues_config.toasts.updated_success")
            : t("queues_config.toasts.created_success"),
        );
        setShowModal(false);
        fetchContacts(page, debouncedSearch);
      } else {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage =
          errorData.message || errorData.error || t("common.error");
        console.error("[ERROR] Error saving contact:", errorData);
        toast.error(errorMessage);
      }
    } catch (error: unknown) {
      console.error("[ERROR] Error saving contact (catch):", error);
      toast.error(t("contacts_page.toast.connection_error", "Error de conexión"));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    
    
    
    

    // Temp: Bypass confirm to test event firing
    // if (!confirm(`¿Ests seguro de eliminar a ${name}?`)) return;

    const toastId = toast.loading(t("contacts_page.toast.deleting", "Eliminando…"));

    try {
      const token = localStorage.getItem("token");
      const url = `${API_BASE_URL}/contacts/${id}`;
      

      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      

      if (!res.ok) {
        const errText = await res.text();
        console.error("Delete failed details:", errText);
        throw new Error(`Failed to delete: ${res.status}`);
      }

      await fetchContacts(page, debouncedSearch);
      toast.success(t("queues_config.toasts.deleted_success"), { id: toastId });
    } catch (error) {
      console.error("[ERROR] Error deleting contact:", error);
      toast.error(t("contacts_page.toast.delete_error", "Error al eliminar contacto"), { id: toastId });
    }
  };

  const handleOpenChat = async (contact: Contact) => {
    if (!contact.phone) {
      toast.error(t("contacts_page.toast.invalid_phone", "Teléfono no válido"));
      return;
    }

    const toastId = toast.loading(t("contacts_page.toast.opening_chat", "Abriendo chat…"));

    try {
      const token = localStorage.getItem("token");

      // 1. Create or Get Conversation
      // Use existing findOrCreate endpoint logic
      const res = await fetch(`${API_BASE_URL}/conversations`, {
        method: "POST", // Endpoint correcto basado en conversationRoutes.ts
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: contact.phone,
          name: contact.name,
          addToContacts: false, // Ya existe en contactos
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Chat Error:", errData);
        throw new Error(
          errData.message || "No se pudo iniciar la conversación",
        );
      }

      const data = await res.json();
      const conversation = data.data?.conversation || data.data;

      if (conversation?.id) {
        toast.dismiss(toastId);
        // Redirect to workspace using conversation ID
        navigate(`/workspace?ticketId=${conversation.id}`);
      } else {
        throw new Error("ID de conversación no recibido");
      }
    } catch (error) {
      console.error("Error opening chat:", error);
      toast.error(t("contacts_page.toast.open_chat_error", "Error al abrir chat"), { id: toastId });
    }
  };

  // Server-side filtering is active, so we use contacts directly
  const displayContacts = contacts;

  // ── Display helpers (hide internal/technical identifiers from the UI) ──
  const isFakeEmail = (email?: string | null) =>
    !!email &&
    (email.includes("@whatsapp.user") ||
      email.includes("@c.us") ||
      email.includes("@lid"));
  const displayEmail = (email?: string | null) =>
    !email || isFakeEmail(email) ? null : email;
  const displayName = (c: Contact) =>
    c.name && c.name !== "Unknown Contact" ? c.name : c.phone || "Sin nombre";
  const initialOf = (c: Contact) => {
    const base = displayName(c).trim();
    const ch = base.charAt(0).toUpperCase();
    return /[A-Z0-9]/.test(ch) ? ch : "#";
  };

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark">
      <ModuleHeader
        title={t("navigation.contacts")}
        description={t("crm.contacts.description")}
        icon={
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        }
        gradient="from-cyan-600 to-sky-600 dark:from-cyan-800 dark:to-sky-800"
        stats={{
          label: t("dashboard.total_contacts"),
          value: totalResults,
        }}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportWhatsApp}
              disabled={importingWa}
              title="Importar contactos de WhatsApp (solo números reales, no LIDs)"
              className="bg-white/15 hover:bg-white/25 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors backdrop-blur-sm border border-white/20 font-medium"
            >
              <MessageSquare className="w-5 h-5" />
              {importingWa ? "Importando…" : "Importar WhatsApp"}
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors backdrop-blur-sm border border-white/20 font-medium"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {t("common.new")}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* SEARCH BAR */}
          <div className="sticky top-0 z-20 bg-reply-bg/80 dark:bg-reply-bg-dark/80 backdrop-blur-xl py-2">
            <div className="relative group w-full">
              <Search className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-cyan-500 transition-colors" />
              <input
                type="text"
                placeholder={t("common.search")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-4 bg-reply-surface dark:bg-reply-panel-dark border border-reply-border dark:border-reply-border-dark rounded-[1.5rem] shadow-sm focus:ring-4 focus:ring-reply-brand/10 focus:border-reply-brand transition-all outline-none font-medium text-reply-text-primary dark:text-reply-text-primary-dark"
              />
            </div>
          </div>

          {/* WHATSAPP SYNC PANEL — self-explanatory enterprise control */}
          <div className="bg-reply-surface dark:bg-reply-panel-dark rounded-[1.75rem] border border-reply-border dark:border-reply-border-dark shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
              <div className="flex items-start gap-4 min-w-0">
                <div className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-gray-900 dark:text-white tracking-tight">
                      Sincronización de WhatsApp
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                        autoImportWa
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-reply-border-dark"
                      }`}
                    >
                      {autoImportWa ? "Automático activado" : "Manual"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1 leading-relaxed max-w-xl">
                    {autoImportWa
                      ? "Cada chat de WhatsApp con número real se guarda como contacto automáticamente. Los identificadores internos (LIDs) nunca se importan."
                      : "Los contactos no se crean solos. Activa el interruptor para guardar automáticamente cada chat con número real, o usa “Importar WhatsApp” para una importación puntual."}
                  </p>
                </div>
              </div>

              {/* Toggle with explicit ON/OFF label */}
              <button
                onClick={handleToggleAutoImport}
                disabled={savingAutoImport}
                role="switch"
                aria-checked={autoImportWa}
                title="Cuando está activo, los chats de WhatsApp con número real crean contactos automáticamente. Los LIDs nunca se importan."
                className="flex items-center justify-between sm:justify-center gap-3 shrink-0 px-4 py-3 sm:py-2.5 bg-reply-bg dark:bg-gray-800/50 rounded-2xl border border-reply-border dark:border-reply-border-dark shadow-sm disabled:opacity-50 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors"
              >
                <span className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">
                  Auto-importar
                </span>
                <span
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoImportWa ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      autoImportWa ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </div>
          </div>

          {/* CONTENT AREA */}
          <Skeleton name="contacts-list" loading={loading}>
            {displayContacts.length === 0 ? (
            <div className="text-center py-20 px-6 bg-reply-surface dark:bg-reply-panel-dark rounded-[3rem] border border-dashed border-reply-border dark:border-reply-border-dark shadow-inner">
              <div className="w-24 h-24 bg-reply-bg dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6 transition-transform hover:scale-110">
                <User className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                {debouncedSearch
                  ? "Sin resultados"
                  : "Aún no tienes contactos"}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-base">
                {debouncedSearch
                  ? `No encontramos contactos para “${debouncedSearch}”. Prueba con otro término.`
                  : "Crea tu primer contacto manualmente o importa los chats de WhatsApp con número real."}
              </p>
              {!debouncedSearch && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
                  <button
                    onClick={() => handleOpenModal()}
                    className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-500/20 transition-all"
                  >
                    {t("common.new")}
                  </button>
                  <button
                    onClick={handleImportWhatsApp}
                    disabled={importingWa}
                    className="px-6 py-3 bg-reply-bg dark:bg-gray-800 border border-reply-border dark:border-reply-border-dark text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:border-emerald-400 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    {importingWa ? "Importando…" : "Importar WhatsApp"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* MOBILE CARDS */}
              <div className="grid grid-cols-1 gap-4 md:hidden pb-4">
                {displayContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="bg-reply-surface dark:bg-reply-surface-dark p-6 rounded-[2.5rem] border border-reply-border dark:border-reply-border-dark shadow-sm transition-all relative overflow-hidden group"
                  >
                    <div className="flex items-center gap-5 mb-5">
                      <div className="h-16 w-16 rounded-[1.25rem] bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-cyan-500/20">
                        {initialOf(contact)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-lg font-black text-gray-900 dark:text-white truncate">
                          {displayName(contact)}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                            Sincronizado
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenChat(contact)}
                        className="p-2 text-reply-brand hover:text-cyan-600 transition-colors"
                      >
                        <MessageSquare className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(contact.id, contact.name)}
                        className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="space-y-3 mb-6 bg-reply-bg/50 dark:bg-gray-800/50 p-4 rounded-2xl">
                      <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                        <div className="w-8 h-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm flex items-center justify-center border border-gray-100 dark:border-reply-border-dark">
                          <svg
                            className="w-4 h-4 opacity-70"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span
                          className={`text-sm truncate ${displayEmail(contact.email) ? "font-semibold" : "italic text-gray-400 dark:text-gray-500 font-medium"}`}
                        >
                          {displayEmail(contact.email) || "Sin correo registrado"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                        <div className="w-8 h-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm flex items-center justify-center border border-gray-100 dark:border-reply-border-dark">
                          <svg
                            className="w-4 h-4 opacity-70"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </div>
                        <span className="text-sm font-black tracking-tight">
                          {contact.phone || t("common.unknown")}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenModal(contact)}
                        className="flex-1 py-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-reply-border-dark hover:bg-reply-bg dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-[1.25rem] font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        onClick={() => {
                          setTimelineContactId(contact.id);
                          setShowTimeline(true);
                        }}
                        className="flex-1 py-4 bg-cyan-600 hover:bg-cyan-700 text-white rounded-[1.25rem] font-bold text-sm transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                      >
                        Timeline
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* DESKTOP TABLE */}
              <div className="hidden md:block bg-reply-surface dark:bg-reply-surface-dark rounded-[2rem] border border-reply-border dark:border-reply-border-dark shadow-xl shadow-gray-200/50 dark:shadow-none overflow-visible mb-6">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-reply-bg/50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 text-[10px] uppercase font-black tracking-[0.2em]">
                      <th className="px-6 py-4">Identidad Corporativa</th>
                      <th className="px-4 py-4">Contacto Directo</th>
                      <th className="px-4 py-4">Notas de CRM</th>
                      <th className="px-4 py-4">Segmentación</th>
                      <th className="px-6 py-4 text-right">Gestión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {displayContacts.map((contact) => (
                      <tr
                        key={contact.id}
                        className="hover:bg-reply-bg/50 dark:hover:bg-cyan-500/[0.02] transition-all group"
                      >
                        <td className="px-6 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/10 border-2 border-white dark:border-reply-border-dark transform group-hover:scale-105 transition-all duration-300">
                              {initialOf(contact)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-gray-900 dark:text-white mb-0.5 tracking-tight truncate max-w-[180px]">
                                {displayName(contact)}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                  {contact.phone ? "WhatsApp" : "Cliente"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 font-semibold opacity-80 group-hover:opacity-100 transition-opacity">
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <span
                                className={`truncate max-w-[150px] ${displayEmail(contact.email) ? "" : "italic text-gray-400 dark:text-gray-500"}`}
                              >
                                {displayEmail(contact.email) || "Sin correo"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-900 dark:text-white tracking-wider bg-reply-bg dark:bg-gray-800/50 w-fit px-2 py-0.5 rounded-md border border-gray-100 dark:border-reply-border-dark">
                              <svg
                                className="w-3 h-3 text-cyan-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              {contact.phone || "-"}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <p
                            className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 italic leading-relaxed font-medium"
                            title={contact.notes}
                          >
                            {contact.notes || t("common.unknown")}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-h-[48px] overflow-hidden">
                            {contact.tags?.map((tagId, i) => {
                              const tagName =
                                allTags.find((t) => t.id === tagId)?.name ||
                                tagId;
                              return (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-cyan-50 dark:bg-cyan-900/10 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-800/50 shadow-sm truncate max-w-[80px]"
                                  title={tagName}
                                >
                                  {tagName}
                                </span>
                              );
                            })}
                            {(!contact.tags || contact.tags.length === 0) && (
                              <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-300 uppercase tracking-tighter italic">
                                <div className="w-1 h-1 rounded-full bg-gray-200" />
                                {t("common.unknown")}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => handleOpenChat(contact)}
                              className="p-2 bg-reply-bg dark:bg-gray-800/50 text-reply-brand hover:bg-reply-brand hover:text-white rounded-xl border border-gray-100 dark:border-reply-border-dark transition-all"
                              title="WhatsApp"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => {
                                setTimelineContactId(contact.id);
                                setShowTimeline(true);
                              }}
                              className="p-2 bg-white dark:bg-gray-800 hover:bg-cyan-600 hover:text-white text-gray-400 rounded-xl transition-all shadow-sm border border-gray-100 dark:border-reply-border-dark active:scale-95"
                              title="Actividad"
                            >
                              <History className="w-4 h-4" />
                            </button>

                            <div className="w-px h-6 bg-gray-100 dark:bg-gray-800 mx-1" />

                            <button
                              onClick={() => handleOpenModal(contact)}
                              className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-all"
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              onClick={() =>
                                handleDelete(contact.id, contact.name)
                              }
                              className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all active:rotate-12"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MODERN PAGINATION CONTROLS */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between bg-reply-surface dark:bg-reply-panel-dark px-6 py-4 rounded-[2rem] border border-reply-border dark:border-reply-border-dark shadow-sm mt-4 mb-10">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      P gina <span className="text-reply-brand dark:text-cyan-400">{page}</span> de {totalPages}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1 || loading}
                      className="p-2 rounded-xl bg-reply-bg dark:bg-gray-800 border border-reply-border dark:border-reply-border-dark text-gray-500 dark:text-gray-400 hover:bg-reply-brand hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    
                    <div className="flex items-center gap-1">
                      {[...Array(Math.min(5, totalPages))].map((_, i) => {
                        let pageNum = page;
                        if (page <= 3) pageNum = i + 1;
                        else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = page - 2 + i;
                        
                        if (pageNum <= 0 || pageNum > totalPages) return null;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={`w-10 h-10 rounded-xl font-bold text-sm transition-all border ${
                              page === pageNum
                                ? "bg-cyan-600 border-cyan-600 text-white shadow-lg shadow-cyan-500/20"
                                : "bg-white dark:bg-gray-800 border-reply-border dark:border-reply-border-dark text-gray-500 dark:text-gray-400 hover:border-cyan-500"
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || loading}
                      className="p-2 rounded-xl bg-reply-bg dark:bg-gray-800 border border-reply-border dark:border-reply-border-dark text-gray-500 dark:text-gray-400 hover:bg-reply-brand hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </>
            )}
          </Skeleton>
        </div>
      </div>

      {/* Contact Form Modal */}
      <ContactFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        editingContact={editingContact}
        allTags={allTags}
        onSave={handleSaveContact}
      />

      {/* Timeline Modal */}
      {showTimeline && timelineContactId && (
        <ContactTimelineView
          contactId={timelineContactId}
          onClose={() => {
            setShowTimeline(false);
            setTimelineContactId(null);
          }}
        />
      )}

      {/* Email Modal */}
      {showEmailModal && selectedEmailContact && (
        <EmailModal
          isOpen={showEmailModal}
          onClose={() => {
            setShowEmailModal(false);
            setSelectedEmailContact(null);
          }}
          contactEmail={selectedEmailContact.email || ""}
          contactId={selectedEmailContact.id} // Note: Ideally use realContactId if available
        />
      )}
    </div>
  );
};
