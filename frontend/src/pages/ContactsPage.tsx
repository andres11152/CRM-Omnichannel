import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Contact, Tag } from "@/types";
import { ModuleHeader } from "@/components/common/ModuleHeader";
import { ContactTimelineView } from "@/components/crm/ContactTimelineView";
import { EmailModal } from "@/components/EmailModal";
import { API_BASE_URL } from "@/services/apiConfig";
import { useNavigate } from "react-router-dom";
import { Search, User, History, Trash2, X, MessageSquare } from "lucide-react";

export const ContactsPage: React.FC = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]); // 🏷️ Store full tag objects
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineContactId, setTimelineContactId] = useState<string | null>(
    null,
  );

  // Email State
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedEmailContact, setSelectedEmailContact] =
    useState<Contact | null>(null);

  // Form State
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newNotes, setNewNotes] = useState("");

  useEffect(() => {
    fetchContacts();
    fetchTags();
  }, []);

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
      console.log("[ContactsPage] Parsed tags:", tagsData);
      setAllTags(tagsData);
    } catch (error) {
      console.error("Error fetching tags:", error);
    }
  };

  const fetchContacts = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("[ContactsPage] Contacts data:", data);
      if (data.status === "success" && data.data?.contacts) {
        setContacts(data.data.contacts);
      } else if (Array.isArray(data)) {
        setContacts(data);
      }
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (contact?: Contact) => {
    if (contact) {
      setEditingContact(contact);

      // Cleanup Logic
      const isFakeEmail =
        contact.email?.includes("@whatsapp.user") ||
        contact.email?.includes("@c.us");
      const cleanEmail = isFakeEmail ? "" : contact.email || "";

      let displayPhone = contact.phone || "";
      if (!displayPhone && isFakeEmail) {
        // Extract phone from tech email if phone field is empty
        displayPhone = contact.email?.split("@")[0] || "";
      }

      setNewName(
        contact.name === "Unknown Contact" || contact.name === displayPhone
          ? ""
          : contact.name,
      );
      setNewEmail(cleanEmail);
      setNewPhone(displayPhone);
      setSelectedTagIds(contact.tags || []);
      setNewNotes(contact.notes || "");
    } else {
      setEditingContact(null);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setSelectedTagIds([]);
      setNewNotes("");
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");

      // Use Unified Upsert Endpoint (Smart Logic) for both Create and Update
      // This ensures backend cleanup logic runs universally
      const url = `${API_BASE_URL}/contacts`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingContact?.id, // Critical: Pass ID to force update on correct record
          name: newName,
          email: newEmail,
          phone: newPhone,
          tags: selectedTagIds,
          notes: newNotes,
        }),
      });

      if (res.ok) {
        toast.success(
          editingContact
            ? "Contacto actualizado"
            : "Contacto creado correctamente",
        );
        setShowModal(false);
        fetchContacts();
      } else {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage =
          errorData.message || errorData.error || "Error al guardar contacto";
        console.error("❌ Error saving contact:", errorData);
        toast.error(errorMessage);
      }
    } catch (error: any) {
      console.error("❌ Error saving contact (catch):", error);
      toast.error("Error de conexión al guardar contacto");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    console.log("🛑 [DELETE REQUEST START]");
    console.log("ID:", id);
    console.log("Name:", name);
    console.log("API_BASE_URL:", API_BASE_URL);

    // Temp: Bypass confirm to test event firing
    // if (!confirm(`¿Ests seguro de eliminar a ${name}?`)) return;

    const toastId = toast.loading(`Eliminando a ${name}...`);

    try {
      const token = localStorage.getItem("token");
      const url = `${API_BASE_URL}/contacts/${id}`;
      console.log("Fetching URL:", url);

      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("Response status:", res.status);

      if (!res.ok) {
        const errText = await res.text();
        console.error("Delete failed details:", errText);
        throw new Error(`Failed to delete: ${res.status}`);
      }

      await fetchContacts();
      toast.success("Contacto eliminado correctamente", { id: toastId });
    } catch (error) {
      console.error("❌ Error deleting contact:", error);
      toast.error("No se pudo eliminar el contacto", { id: toastId });
    }
  };

  const handleOpenChat = async (contact: Contact) => {
    if (!contact.phone) {
      toast.error("Este contacto no tiene un teléfono vlido");
      return;
    }

    const toastId = toast.loading("Abriendo chat...");

    try {
      const token = localStorage.getItem("token");

      // 1. Create or Get Conversation
      // Utiliza el endpoint existente que maneja la lógica de findOrCreate
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
        // Navegar al workspace con el ID del ticket/conversación
        navigate(`/workspace?ticketId=${conversation.id}`);
      } else {
        throw new Error("ID de conversación no recibido");
      }
    } catch (error) {
      console.error("Error opening chat:", error);
      toast.error("Error al abrir WhatsApp", { id: toastId });
    }
  };

  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone?.includes(searchTerm),
  );

  console.log("[ContactsPage] Total contacts:", contacts.length);
  console.log("[ContactsPage] Filtered contacts:", filteredContacts.length);
  console.log("[ContactsPage] Search term:", searchTerm);
  console.log("[ContactsPage] First contact:", contacts[0]);
  console.log("[ContactsPage] Loading:", loading);

  return (
    <div className="h-full flex flex-col bg-reply-bg dark:bg-reply-bg-dark">
      <ModuleHeader
        title="Contactos"
        description="Gestiona tu base de datos de clientes"
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
          label: "Total Contactos",
          value: contacts.length,
        }}
        action={
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
            Nuevo Contacto
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* TOOLBAR */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20 bg-reply-bg/80 dark:bg-reply-bg-dark/80 backdrop-blur-xl py-2">
            <div className="relative group flex-1 max-w-2xl">
              <Search className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-cyan-500 transition-colors" />
              <input
                type="text"
                placeholder="Buscar por nombre, email o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-4 bg-reply-surface dark:bg-reply-panel-dark border border-reply-border dark:border-reply-border-dark rounded-[1.5rem] shadow-sm focus:ring-4 focus:ring-reply-brand/10 focus:border-reply-brand transition-all outline-none font-medium text-reply-text-primary dark:text-reply-text-primary-dark"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex px-4 py-2 bg-reply-surface dark:bg-reply-panel-dark rounded-2xl border border-reply-border dark:border-reply-border-dark shadow-sm text-[10px] font-black text-reply-text-secondary dark:text-reply-text-secondary-dark uppercase tracking-widest items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                {filteredContacts.length} Contactos
              </div>
            </div>
          </div>

          {/* CONTENT AREA */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="h-56 bg-reply-surface dark:bg-reply-panel-dark rounded-[2.5rem] border border-reply-border dark:border-reply-border-dark animate-pulse"
                />
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-24 bg-reply-surface dark:bg-reply-panel-dark rounded-[3rem] border border-dashed border-reply-border dark:border-reply-border-dark shadow-inner">
              <div className="w-24 h-24 bg-reply-bg dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-6 transition-transform hover:scale-110">
                <User className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                {searchTerm ? "Sin resultados" : "Tu lista estáá vacía"}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto text-base">
                {searchTerm
                  ? "No encontramos nada que coincida con tu búsqueda."
                  : "Parece que aún no tienes contactos. ¡Agrega el primero ahora!"}
              </p>
            </div>
          ) : (
            <>
              {/* MOBILE CARDS */}
              <div className="grid grid-cols-1 gap-4 md:hidden pb-10">
                {filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="bg-reply-surface dark:bg-reply-surface-dark p-6 rounded-[2.5rem] border border-reply-border dark:border-reply-border-dark shadow-sm transition-all relative overflow-hidden group"
                  >
                    <div className="flex items-center gap-5 mb-5">
                      <div className="h-16 w-16 rounded-[1.25rem] bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-cyan-500/20">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-lg font-black text-gray-900 dark:text-white truncate">
                          {contact.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                            Sincronizado
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          toast.info(
                            "Función Enterprise: Próximamente disponible",
                            {
                              description:
                                "Estamos trabajando para integrar WhatsApp Directo.",
                            },
                          )
                        }
                        className="p-2 text-gray-300 hover:text-gray-400 cursor-not-allowed transition-colors relative group"
                      >
                        <MessageSquare className="w-5 h-5 opacity-50" />
                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                          Próximamente
                        </span>
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
                        <span className="text-sm font-semibold truncate">
                          {contact.email && !contact.email.includes("@")
                            ? "-"
                            : contact.email?.includes("whatsapp.user") ||
                                contact.email?.includes("c.us")
                              ? "WhatsApp User"
                              : contact.email || "Sin email"}
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
                          {contact.phone ||
                            (contact.email?.includes("whatsapp.user")
                              ? contact.email.split("@")[0]
                              : "Sin teléfono")}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenModal(contact)}
                        className="flex-1 py-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-reply-border-dark hover:bg-reply-bg dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-[1.25rem] font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        Editar
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
              <div className="hidden md:block bg-reply-surface dark:bg-reply-surface-dark rounded-[2rem] border border-reply-border dark:border-reply-border-dark shadow-xl shadow-gray-200/50 dark:shadow-none overflow-visible">
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
                    {filteredContacts.map((contact) => (
                      <tr
                        key={contact.id}
                        className="hover:bg-reply-bg/50 dark:hover:bg-cyan-500/[0.02] transition-all group"
                      >
                        <td className="px-6 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/10 border-2 border-white dark:border-reply-border-dark transform group-hover:scale-105 transition-all duration-300">
                              {contact.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-gray-900 dark:text-white mb-0.5 tracking-tight truncate max-w-[180px]">
                                {contact.name}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widestá">
                                  {contact.channel || "Cliente"}
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
                              <span className="truncate max-w-[150px]">
                                {contact.email && !contact.email.includes("@")
                                  ? "-"
                                  : contact.email?.includes("whatsapp.user") ||
                                      contact.email?.includes("c.us")
                                    ? "WhatsApp User"
                                    : contact.email || "Sin correo"}
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
                              {contact.phone ||
                                (contact.email?.includes("whatsapp.user")
                                  ? contact.email.split("@")[0]
                                  : "-")}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <p
                            className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 italic leading-relaxed font-medium"
                            title={contact.notes}
                          >
                            {contact.notes || "Sin notas."}
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
                                Sin segmentar
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() =>
                                toast.info(
                                  "Función Enterprise: Próximamente disponible",
                                  {
                                    description:
                                      "Estamos trabajando para integrar WhatsApp Directo.",
                                  },
                                )
                              }
                              className="p-2 bg-reply-bg dark:bg-gray-800/50 text-gray-300 cursor-not-allowed rounded-xl border border-gray-100 dark:border-reply-border-dark relative group"
                              title="Enterprise (Pronto)"
                            >
                              <MessageSquare className="w-4 h-4 opacity-50" />
                              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                                Próximamente
                              </span>
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

                            <button
                              onClick={() => {
                                setSelectedEmailContact(contact);
                                setShowEmailModal(true);
                              }}
                              className="p-2 bg-white dark:bg-gray-800 hover:bg-indigo-600 hover:text-white text-gray-400 rounded-xl transition-all shadow-sm border border-gray-100 dark:border-reply-border-dark active:scale-95"
                              title="Email"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </button>

                            <div className="w-px h-6 bg-gray-100 dark:bg-gray-800 mx-1" />

                            <button
                              onClick={() => handleOpenModal(contact)}
                              className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-all"
                            >
                              Editar
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
            </>
          )}
        </div>
      </div>

      {/* Modal */}
      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-reply-surface dark:bg-reply-panel-dark rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-reply-border dark:border-reply-border-dark transform transition-all scale-100 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-8 py-6 border-b border-reply-border dark:border-reply-border-dark bg-reply-bg dark:bg-reply-bg-dark flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  {editingContact ? "Editar Contacto" : "Nuevo Contacto"}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  {editingContact
                    ? "Actualiza la información del cliente"
                    : "Agrega un nuevo cliente a tu base de datos"}
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Area */}
            <div className="overflow-y-auto custom-scrollbar p-8">
              <form
                id="contact-form"
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Nombre Completo <span className="text-red-500">*</span>
                    </label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-gray-400 group-focus-within:text-cyan-500 transition-colors" />
                      </div>
                      <input
                        required
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        className="w-full pl-12 pr-4 py-3.5 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 transition-all outline-none font-semibold text-gray-900 dark:text-white placeholder-gray-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="cliente@ejemplo.com"
                        className="w-full px-4 py-3.5 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 transition-all outline-none font-semibold text-gray-900 dark:text-white placeholder-gray-400 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+57 300 123 4567"
                        className="w-full px-4 py-3.5 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 transition-all outline-none font-semibold text-gray-900 dark:text-white placeholder-gray-400 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Etiquetas
                    </label>
                    <div className="space-y-3 bg-reply-bg dark:bg-gray-800/30 p-4 rounded-2xl border border-gray-100 dark:border-reply-border-dark">
                      {/* SELECTED TAGS */}
                      <div className="flex flex-wrap gap-2 min-h-[32px]">
                        {selectedTagIds.map((id) => {
                          const tag = allTags.find((t) => t.id === id);
                          return tag ? (
                            <span
                              key={id}
                              className={`pl-3 pr-2 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border shadow-sm ${tag.color ? tag.color + " border-transparent" : "bg-white text-gray-800 border-gray-200"}`}
                            >
                              {tag.name}
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedTagIds((prev) =>
                                    prev.filter((tid) => tid !== id),
                                  )
                                }
                                className="bg-black/10 hover:bg-black/20 rounded-full p-0.5 transition-colors"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ) : null;
                        })}
                        {selectedTagIds.length === 0 && (
                          <span className="text-gray-400 text-sm italic flex items-center gap-2">
                            Sin etiquetas seleccionadas
                          </span>
                        )}
                      </div>

                      {/* SEPARATOR */}
                      <div className="h-px bg-gray-200 dark:bg-gray-700 w-full" />

                      {/* AVAILABLE TAGS */}
                      <div>
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2.5">
                          Disponibles para agregar
                        </div>
                        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar">
                          {allTags
                            .filter((t) => !selectedTagIds.includes(t.id))
                            .map((tag) => (
                              <button
                                key={tag.id}
                                type="button"
                                onClick={() =>
                                  setSelectedTagIds((prev) => [...prev, tag.id])
                                }
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:scale-105 active:scale-95 ${tag.color ? "bg-white dark:bg-reply-panel-dark " + tag.color.replace("text-", "border-").replace("bg-", "text-") : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"}`}
                              >
                                + {tag.name}
                              </button>
                            ))}
                          {allTags.filter((t) => !selectedTagIds.includes(t.id))
                            .length === 0 && (
                            <span className="text-gray-400 text-xs italic">
                              No hay ms etiquetas disponibles
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Notas Internas
                    </label>
                    <textarea
                      rows={3}
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Información relevante, preferencias, historial..."
                      className="w-full px-4 py-3.5 bg-reply-bg dark:bg-gray-800/50 border border-gray-200 dark:border-reply-border-dark rounded-2xl focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-500 transition-all outline-none font-medium text-gray-900 dark:text-white placeholder-gray-400 resize-none text-sm"
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 bg-reply-bg dark:bg-reply-surface-dark/50 border-t border-gray-100 dark:border-reply-border-dark flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-6 py-3 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="contact-form" // Link to form via ID
                className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all transform hover:-translate-y-0.5"
              >
                {editingContact ? "Guardar Cambios" : "Crear Contacto"}
              </button>
            </div>
          </div>
        </div>
      )}

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


