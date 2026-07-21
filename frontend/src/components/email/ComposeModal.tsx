import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/axios";
import { toast } from "sonner";
import { Send, Plus, Reply, Forward, ReplyAll } from "lucide-react";
import { Modal, ModalButton } from "@/components/ui/Modal";

// ────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────

interface ComposeData {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  contactId?: string;
}

type ComposeMode = "new" | "reply" | "replyAll" | "forward";

interface EmailRef {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string | null;
  createdAt: string;
  contactId?: string;
}

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  mode: ComposeMode;
  replyTo?: EmailRef | null;
}

// ────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────

const extractEmail = (from: string): string => {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
};

const buildQuotedHtml = (email: EmailRef): string => {
  const date = new Date(email.createdAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  return `<br/><br/><div style="border-left:3px solid #ccc;padding-left:12px;margin-top:16px;color:#666"><p>El ${date}, <strong>${email.from}</strong> escribió:</p><blockquote>${email.bodyHtml || ""}</blockquote></div>`;
};

// ────────────────────────────────────────────────
// COMPONENT
// ────────────────────────────────────────────────

export const ComposeModal: React.FC<ComposeModalProps> = ({ open, onClose, onSent, mode, replyTo }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<ComposeData>({ to: "", cc: "", bcc: "", subject: "", bodyHtml: "", contactId: undefined });
  const [sending, setSending] = useState(false);
  const [showCc, setShowCc] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "new" || !replyTo) {
      setForm({ to: "", cc: "", bcc: "", subject: "", bodyHtml: "", contactId: undefined });
      setShowCc(false);
      return;
    }

    const fromEmail = extractEmail(replyTo.from);
    const quoted = buildQuotedHtml(replyTo);

    switch (mode) {
      case "reply":
        setForm({ to: fromEmail, cc: "", bcc: "", subject: `Re: ${replyTo.subject}`, bodyHtml: quoted, contactId: replyTo.contactId });
        setShowCc(false);
        break;
      case "replyAll": {
        const allTo = [fromEmail, ...replyTo.to.filter((e) => e !== fromEmail)].join(", ");
        setForm({ to: allTo, cc: replyTo.cc.join(", "), bcc: "", subject: `Re: ${replyTo.subject}`, bodyHtml: quoted, contactId: replyTo.contactId });
        setShowCc(replyTo.cc.length > 0);
        break;
      }
      case "forward":
        setForm({ to: "", cc: "", bcc: "", subject: `Fwd: ${replyTo.subject}`, bodyHtml: quoted, contactId: undefined });
        setShowCc(false);
        break;
    }
  }, [open, mode, replyTo]);

  const handleSend = async () => {
    if (!form.to.trim()) { toast.error(t("compose_modal.toast.recipient_required", "Destinatario requerido")); return; }
    if (!form.subject.trim()) { toast.error(t("compose_modal.toast.subject_required", "Asunto requerido")); return; }

    setSending(true);
    try {
      const toArr = form.to.split(",").map((e) => e.trim()).filter(Boolean);
      const ccArr = form.cc ? form.cc.split(",").map((e) => e.trim()).filter(Boolean) : undefined;
      const bccArr = form.bcc ? form.bcc.split(",").map((e) => e.trim()).filter(Boolean) : undefined;

      await api.post("/emails/send", {
        to: toArr,
        cc: ccArr,
        bcc: bccArr,
        subject: form.subject,
        bodyHtml: form.bodyHtml || "<p></p>",
        contactId: form.contactId || undefined,
      });

      toast.success(t("compose_modal.toast.sent", "Correo enviado"));
      onSent();
      onClose();
    } catch (error) {
      console.error("Send email failed:", error);
      toast.error(t("compose_modal.toast.send_error", "Error al enviar correo"));
    } finally {
      setSending(false);
    }
  };

  const modeLabels: Record<ComposeMode, { title: string; icon: React.ReactNode }> = {
    new: { title: "Nuevo Correo", icon: <Plus size={18} /> },
    reply: { title: "Responder", icon: <Reply size={18} /> },
    replyAll: { title: "Responder a Todos", icon: <ReplyAll size={18} /> },
    forward: { title: "Reenviar", icon: <Forward size={18} /> },
  };

  const modeInfo = modeLabels[mode];

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={modeInfo.title}
      icon={modeInfo.icon}
      size="lg"
      busy={sending}
      footer={
        <>
          <span className="mr-auto text-xs text-gray-400">
            Presiona <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-bold">Ctrl+Enter</kbd> para enviar
          </span>
          <ModalButton variant="primary" onClick={handleSend} loading={sending}>
            {!sending && <Send size={14} />}
            {sending ? "Enviando..." : "Enviar"}
          </ModalButton>
        </>
      }
    >
      <div className="-mx-6 -my-5">
        {/* Fields */}
        <div className="p-4 space-y-3 border-b border-gray-100 dark:border-reply-border-dark/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 w-12 shrink-0 uppercase">Para:</span>
            <input
              type="text"
              value={form.to}
              onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white outline-none placeholder-gray-400 font-medium"
              placeholder="destinatario@email.com"
              autoFocus
            />
            {!showCc && (
              <button onClick={() => setShowCc(true)} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/20">
                CC/BCC
              </button>
            )}
          </div>

          {showCc && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 w-12 shrink-0 uppercase">CC:</span>
                <input
                  type="text"
                  value={form.cc}
                  onChange={(e) => setForm((p) => ({ ...p, cc: e.target.value }))}
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white outline-none placeholder-gray-400"
                  placeholder="cc@email.com"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 w-12 shrink-0 uppercase">BCC:</span>
                <input
                  type="text"
                  value={form.bcc}
                  onChange={(e) => setForm((p) => ({ ...p, bcc: e.target.value }))}
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white outline-none placeholder-gray-400"
                  placeholder="bcc@email.com"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 w-12 shrink-0 uppercase">Asunto:</span>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white outline-none placeholder-gray-400 font-medium"
              placeholder="Asunto del correo"
            />
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          <textarea
            value={form.bodyHtml}
            onChange={(e) => setForm((p) => ({ ...p, bodyHtml: e.target.value }))}
            className="w-full min-h-[220px] bg-transparent text-sm text-gray-900 dark:text-white outline-none resize-none leading-relaxed placeholder-gray-400"
            placeholder="Escribe tu mensaje aquí..."
          />
        </div>
      </div>
    </Modal>
  );
};
