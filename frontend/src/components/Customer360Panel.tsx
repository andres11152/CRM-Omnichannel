import React, { useState } from "react";
import {
  User,
  Mail,
  Phone,
  ShieldCheck,
  Copy,
  Check,
  Edit3,
  Zap,
  ClipboardCheck,
  Calendar,
  ChevronRight,
  Building2,
  Info,
  Clock,
  Users,
  Tag as TagIcon,
  Plus,
  X,
} from "lucide-react";
import { Contact, Tag } from "@/types";
import { API_BASE_URL } from "@/services/apiConfig";
import { InternalNotes } from "./InternalNotes";
import { toast } from "sonner";
import { ImageLightbox } from "./ImageLightbox";
import { Avatar } from "@/components/common/Avatar";

interface Customer360PanelProps {
  contact: Contact;
  onEditContact: () => void;
  onCreateTask?: () => void;
  onScheduleMeeting?: () => void;
  onContactUpdate?: (contact: Contact) => void;
}

const Customer360PanelComponent: React.FC<Customer360PanelProps> = ({
  contact,
  onEditContact,
  onCreateTask,
  onScheduleMeeting,
  onContactUpdate,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    alt: string;
  } | null>(null);

  // Enterprise Tags State (Deprecated in favor of TagsNavbar)
  const [allTags, setAllTags] = useState<Tag[]>([]);

  // Fetch all available tags
  React.useEffect(() => {
    const fetchTags = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/tags`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setAllTags(data);
          else if (data && Array.isArray(data.data)) setAllTags(data.data);
        }
      } catch (e) {
        console.error("Error loading tags in Customer360", e);
      }
    };
    fetchTags();
  }, []);

  //  GROUP DETECTION
  const isGroup = contact.isGroup || false;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`${field} copiado`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="w-full md:w-96 bg-white dark:bg-reply-surface-dark border-l border-gray-100 dark:border-reply-border-dark flex flex-col h-full relative">
      {/* Dynamic Header with Status Indicator */}
      <div className="p-4 border-b border-gray-100 dark:border-reply-border-dark bg-white dark:bg-reply-surface-dark flex items-center justify-between flex-shrink-0">
        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.1em] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-500" />
          {isGroup ? "Grupo 360°" : "Customer 360°"}
        </h3>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
            Live
          </span>
        </div>
      </div>

      {/* Main Container with subtle scrollbar */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-reply-bg/30 dark:bg-reply-surface-dark">
        {/* Profile Card Section */}
        <div className="p-6 text-center border-b border-gray-100 dark:border-reply-border-dark bg-white dark:bg-reply-surface-dark">
          <div className="relative inline-block group">
            <div
              className={`absolute -inset-0.5 ${isGroup ? "bg-gradient-to-r from-green-500 to-emerald-500" : "bg-gradient-to-r from-blue-500 to-indigo-500"} rounded-full opacity-30 group-hover:opacity-60 transition duration-500 blur`}
            ></div>
            <Avatar
              src={contact.profilePicUrl || contact.avatarUrl || null}
              name={contact.name || ""}
              className="relative w-24 h-24 border-2 border-white dark:border-gray-900 shadow-xl transform transition-transform group-hover:scale-[1.02] cursor-pointer"
            />
            <div
              className={`absolute bottom-1 right-1 ${isGroup ? "w-8 h-8 bg-green-500" : "w-6 h-6 bg-white dark:bg-reply-panel-dark"} p-1 rounded-full shadow-lg flex items-center justify-center border border-gray-100 dark:border-reply-border-dark`}
            >
              {isGroup ? (
                <Users className="w-4 h-4 text-white" />
              ) : (
                <div className="w-full h-full bg-emerald-500 rounded-full"></div>
              )}
            </div>
          </div>

          <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-4 mb-1">
            {isGroup ? contact.name.replace(/^\[GROUP\]\s*/i, '') : contact.name}
          </h2>

          {/* Group Badge or Last Activity */}
          {isGroup ? (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center justify-center gap-1 font-semibold">
              <Users className="w-3.5 h-3.5" />
              <span>Grupo de WhatsApp</span>
            </p>
          ) : (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1.5 font-medium tracking-wide">
              <Clock className="w-3 h-3 opacity-70" />
              {contact.lastMessageTime
                ? new Date(contact.lastMessageTime).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : new Date().toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
            </p>
          )}
        </div>

        {/* Contact Details Grid */}
        <div className="p-4 space-y-4">
          {/* Card: Essential Info */}
          <div className="bg-white dark:bg-reply-surface-dark rounded-xl border border-gray-100 dark:border-reply-border-dark p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-1 text-gray-400">
              <Info className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {isGroup ? "Información del Grupo" : "Detalles de Contacto"}
              </span>
            </div>

            {/* Email Field - Only show if it's a REAL email (not internal IDs) */}
            {contact.email &&
              !contact.email.includes("@whatsapp.user") &&
              !contact.email.includes("@lid") &&
              !contact.email.includes("@g.us") &&
              !isGroup && (
                <div className="group flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-reply-bg dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">
                        Email
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-200 truncate">
                        {contact.email}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(contact.email!, "Email")}
                    className="p-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                  >
                    {copiedField === "Email" ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )}

            {/* Phone Field - Only show for individual chats with valid phone */}
            {contact.phone &&
              !isGroup &&
              contact.phone.startsWith("+") &&
              contact.phone.length >= 8 && (
                <div className="group flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-reply-bg dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter">
                        WhatsApp
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-200 font-mono">
                        {contact.phone}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(contact.phone!, "Teléfono")}
                    className="p-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all"
                  >
                    {copiedField === "Teléfono" ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              )}

            {/* Edit Button - Hide for groups */}
            {!isGroup && (
              <button
                onClick={onEditContact}
                className="w-full mt-2 py-2 flex items-center justify-center gap-2 text-xs font-bold text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 bg-reply-bg/50 dark:bg-gray-800/30 hover:bg-white dark:hover:bg-gray-800 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Editar Información
              </button>
            )}
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white dark:bg-reply-surface-dark rounded-xl border border-gray-100 dark:border-reply-border-dark p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1 text-gray-400">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Acciones Rápidas
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={onCreateTask}
                className="group flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-reply-border-dark hover:border-indigo-100 dark:hover:border-indigo-900/30 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <ClipboardCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                      Nueva Tarea
                    </p>
                    <p className="text-[10px] text-gray-400">
                      Asignar seguimiento
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={onScheduleMeeting}
                className="group flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-reply-border-dark hover:border-emerald-100 dark:hover:border-emerald-900/30 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                      Agendar Reunión
                    </p>
                    <p className="text-[10px] text-gray-400">
                      Programar llamada
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Internal Notes Container */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3 text-gray-400">
              <Building2 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Bitácora Interna
              </span>
            </div>
            <InternalNotes
              contactId={contact.realContactId || contact.id}
              contactName={contact.name}
              contactPhone={contact.phone}
              contact={contact}
              onEditContact={onEditContact}
              className="w-full"
            />
          </div>
        </div>
      </div>
      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage.url}
          alt={lightboxImage.alt}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
};

export const Customer360Panel = React.memo(Customer360PanelComponent);
