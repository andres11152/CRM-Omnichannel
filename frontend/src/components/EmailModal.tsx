import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { sendEmail, SendEmailDTO } from "@/services/emailService";
import { api } from "@/lib/axios";
import { Modal, ModalButton } from "@/components/ui/Modal";

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactEmail?: string;
  contactId?: string;
  ticketId?: string;
}

export const EmailModal: React.FC<EmailModalProps> = ({
  isOpen,
  onClose,
  contactEmail = "",
  contactId,
  ticketId,
}) => {
  const { t } = useTranslation();
  const [to, setTo] = useState(contactEmail);
  const [from, setFrom] = useState("Cargando...");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);

  useEffect(() => {
    if (isOpen) {
      //  FIX: Use axios api instance
      api
        .get("/company/email-config")
        .then((res) => {
          const data = res.data.data;
          if (data?.isConfigured && data?.senderEmail) {
            // Email configurado correctamente
            const senderName = data.senderName || "Mi Empresa";
            const senderEmail = data.senderEmail;
            setFrom(`${senderName} <${senderEmail}>`);
            setEmailConfigured(true);
          } else {
            // Email NO configurado
            setFrom("[WARNING] Sin configurar");
            setEmailConfigured(false);
          }
        })
        .catch((err) => {
          console.error("Error fetching email config:", err);
          setFrom("[WARNING] Error al cargar");
          setEmailConfigured(false);
        });
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!emailConfigured) {
      toast.error(t("email_modal.toast.not_configured", "Configura tu correo primero"));
      return;
    }

    if (!to || !subject || !body) {
      toast.error(t("email_modal.toast.missing_fields", "Completa todos los campos"));
      return;
    }

    setIsSending(true);
    try {
      const emailData: SendEmailDTO = {
        to: [to],
        subject,
        bodyHtml: `<p>${body.replace(/\n/g, "<br>")}</p>`,
        bodyText: body,
        contactId,
        ticketId,
        enableTracking: true,
      };

      await sendEmail(emailData);
      toast.success(t("email_modal.toast.sent", "Email enviado"));
      onClose();

      // Reset form
      setTo("");
      setSubject("");
      setBody("");
    } catch (error: unknown) {
      console.error("Error sending email:", error);
      toast.error(
        error instanceof Error ? error.message : t("email_modal.toast.send_error", "Error al enviar el email"),
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Redactar Nuevo Email"
      subtitle="Envía correos directamente desde el CRM"
      icon={<Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
      size="lg"
      busy={isSending}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            Cancelar
          </ModalButton>
          <ModalButton variant="primary" onClick={handleSend} loading={isSending} disabled={!emailConfigured}>
            {!isSending && <Send className="w-4 h-4" />}
            {isSending ? "Enviando..." : "Enviar Email"}
          </ModalButton>
        </>
      }
    >
        {/* Content */}
        <div className="space-y-5">
          {/* Email Not Configured Warning */}
          {!emailConfigured && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-4 animate-slide-in">
              <div className="flex-shrink-0 p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600 dark:text-amber-500">
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100 mb-1">
                  Acción Requerida
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-200/80 leading-relaxed mb-3">
                  Para enviar emails, primero debes configurar tu cuenta de
                  correo corporativo en el sistema.
                </p>
                <a
                  href="/settings"
                  className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:text-amber-900 hover:underline inline-flex items-center gap-1"
                >
                  Ir a Configuración →
                </a>
              </div>
            </div>
          )}

          {/* From Field */}
          <div className="group">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
              De
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-400 dark:text-gray-500">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </span>
              </div>
              <input
                type="text"
                value={from}
                disabled
                className="w-full pl-9 pr-4 py-2.5 bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-reply-border-dark rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm opacity-80 cursor-not-allowed select-none"
              />
            </div>
          </div>

          {/* To Field */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
              Para
            </label>
            <div className="relative">
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="destinatario@ejemplo.com"
                className="w-full px-4 py-2.5 bg-white dark:bg-reply-border-dark border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded cursor-help"
                  title="Destinatario Principal"
                >
                  TO
                </span>
              </div>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
              Asunto
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Escribe un asunto claro..."
              className="w-full px-4 py-2.5 bg-white dark:bg-reply-border-dark border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm font-medium"
            />
          </div>

          {/* Body */}
          <div className="flex-1 min-h-[150px]">
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-1">
              Mensaje
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribe el contenido de tu correo aquíí..."
              className="w-full h-full min-h-[200px] px-4 py-3 bg-white dark:bg-reply-border-dark border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-inner resize-y leading-relaxed"
            />
          </div>
        </div>
    </Modal>
  );
};
