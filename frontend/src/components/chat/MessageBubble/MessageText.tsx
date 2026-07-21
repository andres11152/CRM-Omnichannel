import React from "react";
import { Message } from "@/types";

interface MessageTextProps {
  message: Message;
  msgType: string;
}

/**
 * Renders the text body of a message, including the specialized
 * "scheduled message" / "payment request" / "data request" card formats
 * that are encoded as marker strings inside plain text content.
 */
export const MessageText: React.FC<MessageTextProps> = ({ message, msgType }) => {
  const content = message.content;
  if (!content) return null;

  // SCHEDULED MESSAGE
  if (content.includes("MENSAJE PROGRAMADO:") || message.status === "SCHEDULED") {
    let realMsg = content;
    let dateDisplay = "Programado";

    if (content.includes("MENSAJE PROGRAMADO:")) {
      const lines = content.split("\n\n");
      realMsg = lines[1] || "";
      dateDisplay = lines[2]?.replace("Para: ", "").replace(" ", "") || "";
    } else if (message.metadata?.scheduledAt) {
      dateDisplay = new Date(message.metadata.scheduledAt as string).toLocaleString();
    }

    return (
      <div className="bg-amber-50/10 p-3 rounded-lg border border-amber-200/30 my-1">
        <div className="flex items-center gap-2 mb-2 border-b border-amber-200/20 pb-1">
          <span className="text-amber-500">⏰</span>
          <span className="font-bold text-amber-200 text-[10px] uppercase tracking-wider">Programado</span>
        </div>
        <p className="italic text-sm mb-2 opacity-90">"{realMsg}"</p>
        <div className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded w-fit">{dateDisplay}</div>
      </div>
    );
  }

  // PAYMENT REQUEST
  if (content.includes("*SOLICITUD DE PAGO*")) {
    return (
      <div className="bg-white/10 p-3 rounded-lg border border-white/20 my-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-emerald-400 font-bold">Pago Solicitado</span>
        </div>
        <p className="text-sm opacity-90 mb-3">{content.replace("*SOLICITUD DE PAGO*", "").trim()}</p>
        <button className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs transition-colors shadow-sm">
          Pagar Ahora
        </button>
      </div>
    );
  }

  // DATA REQUEST
  if (content.includes("*SOLICITUD DE DATOS*")) {
    return (
      <div className="bg-teal-500/10 p-3 rounded-lg border border-teal-500/30 my-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-teal-400 font-bold">Datos Requeridos</span>
        </div>
        <p className="text-sm opacity-90 whitespace-pre-wrap">{content.replace("*SOLICITUD DE DATOS*", "").trim()}</p>
      </div>
    );
  }

  // DEFAULT TEXT
  // Don't render redundant placeholder texts if media renderer successfully captured it
  if (msgType !== "text") {
    const upperContent = content.toUpperCase();
    const isRedundant =
      upperContent === `[${msgType.toUpperCase()}]` ||
      upperContent === `[${msgType}]` ||
      // Spanish Fallbacks
      (msgType === "image" && upperContent === "[IMAGEN]") ||
      (msgType === "video" && upperContent === "[VIDEO]") ||
      (msgType === "audio" && upperContent === "[AUDIO]") ||
      (msgType === "document" && (upperContent === "[DOCUMENTO]" || upperContent === "[ARCHIVO]")) ||
      (msgType === "sticker" && (upperContent === "[STICKER]" || upperContent === "[IMAGE]"));

    if (isRedundant) return null;
  }

  return (
    <p
      className="whitespace-pre-wrap"
      style={{
        wordBreak: "break-word",
        overflowWrap: "anywhere",
      }}
    >
      {content}
    </p>
  );
};
