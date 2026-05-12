import React, { useState, useEffect } from "react";
import { api } from "@/lib/axios";
import { toast } from "sonner";
import { X, Send, Plus, Reply, Forward, ReplyAll } from "lucide-react";

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
    if (!form.to.trim()) { toast.error("Ingresa al menos un destinatario"); return; }
    if (!form.subject.trim()) { toast.error("Ingresa un asunto"); return; }

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

      toast.success("Correo enviado exitosamente");
      onSent();
      onClose();
    } catch (error) {
      console.error("Send email failed:", error);
      toast.error("Error al enviar el correo");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const modeLabels: Record<ComposeMode, { title: string; icon: React.ReactNode }> = {
    new: { title: "Nuevo Correo", icon: <Plus size={18} /> },
    reply: { title: "Responder", icon: <Reply size={18} /> },
    replyAll: { title: "Responder a Todos", icon: <ReplyAll size={18} /> },
    forward: { title: "Reenviar", icon: <Forward size={18} /> },
  };

  const modeInfo = modeLabels[mode];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-reply-panel-dark w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-200 dark:border-reply-border-dark">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-reply-border-dark/60 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
            {modeInfo.icon}
            <h3 className="font-bold text-lg">{modeInfo.title}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-white/50 dark:hover:bg-gray-800 transition-colors">
            <X size={18} />
          </button>
        </div>

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
        <div className="flex-1 overflow-y-auto p-4">
          <textarea
            value={form.bodyHtml}
            onChange={(e) => setForm((p) => ({ ...p, bodyHtml: e.target.value }))}
            className="w-full h-full min-h-[200px] bg-transparent text-sm text-gray-900 dark:text-white outline-none resize-none leading-relaxed placeholder-gray-400"
            placeholder="Escribe tu mensaje aquí..."
          />
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-reply-border-dark/60 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            Presiona <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] font-bold">Ctrl+Enter</kbd> para enviar
          </div>
          <button
            onClick={handleSend}
            disabled={sending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {sending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
};
