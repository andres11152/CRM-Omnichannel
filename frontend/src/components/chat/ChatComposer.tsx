import React from "react";
import { SmartComposer } from "../SmartComposer";
import { AudioRecorder } from "../AudioRecorder";
import { QuickReply, Message } from "@/types";
import { QuickReplies } from "../QuickReplies";
import { InlineQuickReplies } from "./InlineQuickReplies";
import EmojiPicker, { Theme } from "emoji-picker-react";

interface ChatComposerProps {
  inputValue: string;
  setInputValue: (val: string) => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  replyingTo: Message | null;
  setReplyingTo: (msg: Message | null) => void;
  onSend: () => void;
  onFileSelect: () => void;
  onEmojiToggle: () => void;
  onAudioStop: (file: File) => void;
  onSlashSelect: (reply: QuickReply) => void;
  isRecording: boolean;
  setIsRecording: (rec: boolean) => void;
  onSchedule?: () => void;
  onProduct?: () => void;
  onProperty?: () => void;
  onPayment?: () => void;
  onRequestData?: () => void;
}

/**
 * [APP] CHAT COMPOSER (WRAPPER)
 * This component provides the outer padding and coordinates between 
 * SmartComposer (Text/AI) and AudioRecorder (Voice).
 */
export const ChatComposer: React.FC<ChatComposerProps> = ({
  inputValue,
  setInputValue,
  selectedFile,
  setSelectedFile,
  replyingTo,
  setReplyingTo,
  onSend,
  onFileSelect,
  onEmojiToggle,
  onAudioStop,
  onSlashSelect,
  isRecording,
  setIsRecording,
  onSchedule,
  onProduct,
  onProperty,
  onPayment,
  onRequestData,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
    onFileSelect(); // For analytics/logging if needed
  };

  const [showQuickReplies, setShowQuickReplies] = React.useState(false);
  const [showSlashMenu, setShowSlashMenu] = React.useState(false);
  const [showEmojiMenu, setShowEmojiMenu] = React.useState(false);
  const [slashQuery, setSlashQuery] = React.useState("");

  // [SEC] Advanced Trigger for Quick Replies and Slash Menu
  React.useEffect(() => {
    // We look for the last slash that isn't preceded by non-space characters
    // Matches: "/shortcut" at start or " /shortcut" anywhere
    const lastSlashIndex = inputValue.lastIndexOf("/");
    
    if (lastSlashIndex !== -1 && (lastSlashIndex === 0 || inputValue[lastSlashIndex - 1] === " ")) {
      const query = inputValue.slice(lastSlashIndex + 1);
      
      // Reset if there's a space after the slash (user likely just typing a path or divider)
      if (query.includes(" ")) {
        setShowSlashMenu(false);
        return;
      }

      setShowSlashMenu(true);
      setSlashQuery(query);
      setShowQuickReplies(false);
    } else {
      setShowSlashMenu(false);
    }
  }, [inputValue]);

  return (
    <div className="px-4 py-3 bg-white/80 dark:bg-[#0b141a]/80 backdrop-blur-xl border-t border-gray-200 dark:border-white/5 relative z-20">
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <div className="max-w-[1400px] mx-auto relative">
        {!isRecording ? (
          <SmartComposer
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={onSend}
            onAttachmentClick={triggerFileSelect}
            onEmojiToggle={() => setShowEmojiMenu((prev) => !prev)}
            isRecording={isRecording}
            onVoiceNoteClick={() => setIsRecording(true)}
            selectedFile={selectedFile}
            onClearFile={() => setSelectedFile(null)}
            replyingTo={replyingTo}
            onClearReply={() => setReplyingTo(null)}
            onAICopilotClick={(action) => console.log('Copilot', action)}
            onQuickRepliesClick={() => setShowQuickReplies((prev) => !prev)} 
            onMediaLibraryClick={() => {}}
            onStickerClick={() => {}}
            onSchedule={onSchedule}
            onProduct={onProduct}
            onProperty={onProperty}
            onPayment={onPayment}
            onRequestData={onRequestData}
            onKeyDown={(e) => {
              if (showSlashMenu && (e.key === 'Enter' || e.key === "Tab" || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
              }
            }}
          />
        ) : (
          <div className="bg-gray-50/50 dark:bg-white/5 rounded-[24px] p-1 border border-indigo-500/30">
            <AudioRecorder
              onSend={(blob) => {
                const file = new File([blob], "voice-note.webm", { type: blob.type });
                onAudioStop(file);
                setIsRecording(false);
              }}
              onCancel={() => setIsRecording(false)}
            />
          </div>
        )}

        {/* SLASH MENU: Inline suggestions above input */}
        {showSlashMenu && (
          <InlineQuickReplies
            query={slashQuery}
            onSelect={(content) => {
              const lastSlashIndex = inputValue.lastIndexOf("/");
              const prefix = inputValue.substring(0, lastSlashIndex);
              setInputValue(prefix + content);
              setShowSlashMenu(false);
            }}
            onClose={() => setShowSlashMenu(false)}
          />
        )}

        {/* QUICK REPLIES MODAL: Only when explicitly clicked */}
        {showQuickReplies && (
          <QuickReplies
            onSelect={(content) => {
              setInputValue(content);
              setShowQuickReplies(false);
            }}
            onClose={() => setShowQuickReplies(false)}
          />
        )}

        {/* EMOJI PICKER MODAL */}
        {showEmojiMenu && (
          <div className="absolute bottom-[calc(100%+10px)] left-4 z-50 animate-in slide-in-from-bottom-2 duration-200">
            <div className="fixed inset-0 z-[-1]" onClick={() => setShowEmojiMenu(false)} />
            <EmojiPicker
              theme={
                typeof document !== "undefined" && document.documentElement.classList.contains("dark")
                  ? Theme.DARK
                  : Theme.LIGHT
              }
              onEmojiClick={(emojiData) => {
                setInputValue(inputValue + emojiData.emoji);
              }}
              lazyLoadEmojis={true}
            />
          </div>
        )}
      </div>
    </div>
  );
};
