import React, { useState, useRef, useEffect } from "react";
import { 
  Sparkles, 
  Paperclip, 
  Image as ImageIcon, 
  Smile, 
  Zap,
  ChevronDown,
  X,
  Mic,
  SendHorizontal,
  Plus,
  Calendar,
  Package,
  CreditCard,
  UserCheck,
  Building2,
  FolderOpen,
  FileText,
  Music,
  Video,
  MapPin,
  UserRound,
  EyeOff
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface SmartComposerProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onQuickRepliesClick: () => void;
  onMediaLibraryClick: () => void;
  onAttachmentClick: () => void;
  onVoiceNoteClick: () => void;
  onStickerClick: () => void;
  onAICopilotClick: (action: "summarize" | "formal" | "suggest") => void;
  onEmojiToggle?: () => void;
  
  // Action Menu Props
  onSchedule?: () => void;
  onProduct?: () => void;
  onProperty?: () => void;
  onRequestData?: () => void;
  onPayment?: () => void;
  onShareLocation?: () => void;
  onContact?: () => void;

  onClearFile?: () => void;
  replyingTo?: { id: string; content: string; senderName?: string } | null;
  onClearReply?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;

  disabled?: boolean;
  isRecording?: boolean;
  selectedFile?: File | null;

  // Pre-uploaded attachment picked from the Media Library (no re-upload needed)
  libraryAttachment?: { name: string; url: string; type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT"; sizeLabel?: string } | null;
  onClearLibraryAttachment?: () => void;
  isWhisperMode?: boolean;
  onWhisperToggle?: () => void;
}

const SmartComposerComponent: React.FC<SmartComposerProps> = ({
  inputValue,
  onInputChange,
  onSend,
  onQuickRepliesClick,
  onMediaLibraryClick,
  onAttachmentClick,
  onVoiceNoteClick,
  onStickerClick,
  onAICopilotClick,
  onEmojiToggle = () => {},

  onSchedule,
  onProduct,
  onProperty,
  onRequestData,
  onPayment,
  onShareLocation,
  onContact,

  disabled = false,
  isRecording = false,
  selectedFile,
  onClearFile,
  replyingTo,
  onClearReply,
  onKeyDown,
  libraryAttachment,
  onClearLibraryAttachment,
  isWhisperMode = false,
  onWhisperToggle = () => {},
}) => {
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();

  // Real thumbnail for image files selected from disk (object URL, revoked on change)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (selectedFile && selectedFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(selectedFile);
      setFilePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setFilePreviewUrl(null);
  }, [selectedFile]);

  const libraryTypeIcon = (type: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT") => {
    switch (type) {
      case "IMAGE": return ImageIcon;
      case "AUDIO": return Music;
      case "VIDEO": return Video;
      default: return FileText;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // [SEC] Allow parent to override or intercept keys (e.g., Slash Menu navigation)
    if (onKeyDown) {
      onKeyDown(e);
      if (e.defaultPrevented) return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  return (
    <div className="flex flex-col w-full animate-in fade-in duration-300">
      
      {/* 1. TOP ACTIONS (Quick Replies, AI, etc.) — single-line row that scrolls
          horizontally on narrow screens instead of wrapping (which made the
          pills grow to 2 lines and the whole bar too tall on mobile). */}
      <div className="flex items-center gap-1.5 px-1 mb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={onQuickRepliesClick}
          className="shrink-0 whitespace-nowrap flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all border border-indigo-100 dark:border-indigo-500/20"
        >
          <Zap className="w-3 h-3" />
          <span>{t("composer.quick_replies", "RESPUESTAS RÁPIDAS")}</span>
        </button>

        <button
          type="button"
          onClick={onWhisperToggle}
          className={`shrink-0 whitespace-nowrap flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
            isWhisperMode
              ? "bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/10 hover:bg-amber-600"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          <span className="flex items-center gap-1">
            <EyeOff className="w-3 h-3" />
            <span>{isWhisperMode ? "MODO SUSURRO" : "SUSURRAR"}</span>
          </span>
        </button>

        <div className="relative group/ai shrink-0">
          <button
            onClick={() => setShowAIMenu(!showAIMenu)}
            className="shrink-0 whitespace-nowrap flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-[10px] font-bold border border-transparent shadow-md shadow-indigo-500/10 transition-all hover:scale-[1.02] active:scale-95"
            title={t("composer.ai_copilot", "AI COPILOT")}
          >
            <Sparkles className="w-3 h-3" />
            <span>{t("composer.ai_copilot", "AI COPILOT")}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showAIMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowAIMenu(false)} 
              />
              <div className="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-reply-elevated-dark rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10 p-2 z-50 animate-in slide-in-from-bottom-2 zoom-in-95 duration-200">
                {[
                  { label: "Responder con IA", value: "suggest" },
                  { label: "Formato Formal", value: "formal" },
                  { label: "Resumir Chat", value: "summarize" }
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onAICopilotClick(option.value as "summarize" | "formal" | "suggest");
                      setShowAIMenu(false);
                    }}
                    className="w-full flex items-center px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-white/5 rounded-xl text-left text-xs font-bold text-gray-700 dark:text-gray-200 transition-colors"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 2. COMPOSER BODY (Glassmorphism inspired) */}
      <div className={`relative flex flex-col rounded-[24px] border shadow-sm transition-all ${
        isWhisperMode
          ? "bg-amber-50/70 dark:bg-amber-950/20 border-amber-500/50 focus-within:ring-2 focus-within:ring-amber-500/30 focus-within:border-amber-500"
          : "bg-white/80 dark:bg-reply-elevated-dark/80 backdrop-blur-md border-gray-200 dark:border-white/10 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500/50"
      }`}>
        
        {/* PREVIEWS (Replies/Files/Library) */}
        {(selectedFile || replyingTo || libraryAttachment) && (
           <div className="p-3 border-b border-gray-100 dark:border-white/5 space-y-2">
             {replyingTo && (
               <div className="flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-500/5 p-2 rounded-xl border-l-4 border-indigo-500 animate-in slide-in-from-left-2">
                  <div className="min-w-0 pr-4">
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">{t("composer.replying_to", "RESPONDIENDO A")} {replyingTo.senderName?.toUpperCase()}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{replyingTo.content}</p>
                  </div>
                  <button onClick={onClearReply} className="p-1.5 hover:bg-white dark:hover:bg-white/10 rounded-full transition-colors">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
               </div>
             )}
             {selectedFile && (
               <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 p-2 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
                  <div className="flex items-center gap-3 min-w-0">
                    {filePreviewUrl ? (
                      <img src={filePreviewUrl} alt={selectedFile.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate pr-4">{selectedFile.name}</p>
                      <p className="text-[10px] text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button onClick={onClearFile} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full transition-colors text-red-500">
                    <X className="w-4 h-4" />
                  </button>
               </div>
             )}
             {libraryAttachment && (
               <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 p-2 rounded-xl border border-dashed border-pink-200 dark:border-pink-500/20">
                  <div className="flex items-center gap-3 min-w-0">
                    {libraryAttachment.type === "IMAGE" ? (
                      <img src={libraryAttachment.url} alt={libraryAttachment.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0">
                        {(() => {
                          const Icon = libraryTypeIcon(libraryAttachment.type);
                          return <Icon className="w-5 h-5 text-pink-600 dark:text-pink-400" />;
                        })()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate pr-4">{libraryAttachment.name}</p>
                      <p className="text-[10px] text-gray-500 flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />
                        {t("composer.from_library", "Biblioteca Multimedia")}
                        {libraryAttachment.sizeLabel ? ` · ${libraryAttachment.sizeLabel}` : ""}
                      </p>
                    </div>
                  </div>
                  <button onClick={onClearLibraryAttachment} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-full transition-colors text-red-500">
                    <X className="w-4 h-4" />
                  </button>
               </div>
             )}
           </div>
        )}

        {/* MAIN INPUT AREA */}
        <div className="flex items-end p-2.5 gap-2">
          <div className="flex items-center gap-1 mb-1">
             <div className="relative">
                <button 
                  onClick={() => setShowActionMenu(!showActionMenu)} 
                  className={`p-2 rounded-full transition-all ${showActionMenu ? 'bg-indigo-600 text-white rotate-45' : 'text-gray-500 hover:text-indigo-500 hover:bg-indigo-50 dark:text-gray-400 dark:hover:bg-white/10'}`}
                  title={t("composer.actions", "Acciones")}
                >
                    <Plus className="w-5.5 h-5.5" />
                </button>

                {showActionMenu && (
                  <div className="absolute bottom-full left-0 mb-4 w-56 bg-white dark:bg-reply-elevated-dark rounded-[24px] shadow-2xl border border-gray-100 dark:border-white/10 overflow-hidden z-50 animate-in slide-in-from-bottom-4 zoom-in-95 duration-200">
                    <div className="p-2 space-y-1">
                      {[
                        { label: t("composer.schedule_send", "Programar Envío"), icon: Calendar, color: 'text-purple-500', onClick: onSchedule },
                        { label: t("composer.send_product", "Enviar Producto"), icon: Package, color: 'text-orange-500', onClick: onProduct },
                        { label: t("composer.send_property", "Enviar Inmueble"), icon: Building2, color: 'text-indigo-500', onClick: onProperty },
                        { label: t("composer.request_payment", "Solicitar Pago"), icon: CreditCard, color: 'text-green-500', onClick: onPayment },
                        { label: t("composer.request_data", "Solicitar Datos"), icon: UserCheck, color: 'text-blue-500', onClick: onRequestData },
                        { label: t("composer.share_location", "Compartir Ubicación"), icon: MapPin, color: 'text-red-500', onClick: onShareLocation },
                        { label: t("composer.send_contact", "Enviar Contacto"), icon: UserRound, color: 'text-teal-500', onClick: onContact },
                        { label: t("composer.media_library", "Enviar desde Biblioteca"), icon: FolderOpen, color: 'text-pink-500', onClick: onMediaLibraryClick },
                        { label: t("composer.attach_file", "Adjuntar Archivo"), icon: Paperclip, color: 'text-gray-500', onClick: onAttachmentClick },
                      ].map((action, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            action.onClick?.();
                            setShowActionMenu(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 dark:hover:bg-white/5 rounded-2xl transition-all group active:scale-95"
                        >
                          <div className={`p-2 rounded-xl bg-gray-50 dark:bg-white/5 group-hover:bg-white dark:group-hover:bg-indigo-500/20 transition-colors`}>
                            <action.icon className={`w-4.5 h-4.5 ${action.color}`} />
                          </div>
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{action.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
             </div>

             <button 
               onClick={onEmojiToggle} 
               className="p-2 text-gray-500 hover:text-indigo-500 hover:bg-indigo-50 dark:text-gray-400 dark:hover:bg-white/10 rounded-full transition-all"
               title={t("composer.emojis", "Emojis")}
             >
                <Smile className="w-5.5 h-5.5" />
             </button>
          </div>

           <textarea
            ref={textareaRef}
            placeholder={isWhisperMode ? "Escribe un susurro interno (no visible para el cliente)..." : t("composer.write_message", "Escribe un mensaje...")}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={1}
            className={`flex-1 bg-transparent border-none focus:ring-0 text-[15px] leading-relaxed text-gray-800 dark:text-gray-100 resize-none py-2 px-1 max-h-[120px] scrollbar-hide ${
              isWhisperMode ? "placeholder-amber-600/60 dark:placeholder-amber-400/40" : "placeholder-gray-400 dark:placeholder-gray-500"
            }`}
          />

          <div className="flex items-center gap-2 mb-1">
            {!inputValue.trim() && !selectedFile && !libraryAttachment ? (
               <button 
                 onClick={onVoiceNoteClick}
                 className="p-2.5 text-gray-500 hover:text-indigo-500 hover:bg-indigo-50 dark:text-gray-400 dark:hover:bg-white/10 rounded-full transition-all active:scale-90"
                 title={t("composer.voice_note", "Nota de Voz")}
               >
                 <Mic className="w-5.5 h-5.5" />
               </button>
            ) : (
              <button 
                onClick={onSend}
                className={`p-2.5 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center text-white ${
                  isWhisperMode
                    ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20"
                    : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20"
                }`}
                title={isWhisperMode ? "Enviar susurro" : t("composer.send", "Enviar")}
              >
                <SendHorizontal className="w-5.5 h-5.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const SmartComposer = React.memo(SmartComposerComponent);
