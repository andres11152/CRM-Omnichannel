import React, { useState } from 'react';
import { ActionMenu } from './ActionMenu';

interface SmartComposerProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onQuickRepliesClick: () => void;
  onMediaLibraryClick: () => void;
  onAttachmentClick: () => void;
  onVoiceNoteClick: () => void;
  onStickerClick: () => void;
  onAICopilotClick: (action: 'summarize' | 'formal' | 'suggest') => void;
  
  // Action Menu Props
  onSchedule?: () => void;
  onProduct?: () => void;
  onRequestData?: () => void;
  onPayment?: () => void;

  disabled?: boolean;
  isRecording?: boolean;
  selectedFile?: File | null;
  onClearFile?: () => void;
}

export const SmartComposer: React.FC<SmartComposerProps> = ({
  inputValue,
  onInputChange,
  onSend,
  onQuickRepliesClick,
  onMediaLibraryClick,
  onAttachmentClick,
  onVoiceNoteClick,
  onStickerClick,
  onAICopilotClick,
  
  // Defaults
  onSchedule = () => {},
  onProduct = () => {},
  onRequestData = () => {},
  onPayment = () => {},

  disabled = false,
  isRecording = false,
  selectedFile,
  onClearFile
}) => {
  const [showAIMenu, setShowAIMenu] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="bg-white dark:bg-reply-panel-dark px-4 py-3 flex flex-col gap-3 border-t border-gray-200 dark:border-reply-border-dark transition-colors duration-200">
      
      {/* âœ… Attachment Preview */}
      {selectedFile && (
        <div className="flex items-center gap-3 p-3 bg-reply-bg dark:bg-reply-surface-dark rounded-lg border border-indigo-100 dark:border-indigo-900/30 relative animate-fade-in mx-2">
            {/* Preview Image or Icon */}
            {selectedFile.type.startsWith('image/') ? (
                <img 
                    src={URL.createObjectURL(selectedFile)} 
                    alt="Preview" 
                    className="w-12 h-12 object-cover rounded-md border border-gray-200 dark:border-reply-border-dark"
                />
            ) : (
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-md flex items-center justify-center">
                     <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
            )}
            
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{selectedFile.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>

            <button 
                onClick={onClearFile}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors transform hover:scale-110"
            >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2">
        {/* Quick Replies */}
        <button
          onClick={onQuickRepliesClick}
          className="group flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-1.5 rounded-lg transition-all text-xs font-medium border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800"
          title="Respuestas Rápidas"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="hidden sm:inline">Respuestas Rápidas</span>
        </button>

        {/* AI Co-pilot */}
        <div className="relative">
          <button
            onClick={() => setShowAIMenu(!showAIMenu)}
            className="group flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 hover:from-purple-100 hover:to-pink-100 dark:hover:from-purple-900/40 dark:hover:to-pink-900/40 text-purple-600 dark:text-purple-400 px-3 py-1.5 rounded-lg transition-all text-xs font-medium border border-purple-200 dark:border-purple-800"
            title="IA Co-pilot"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="hidden sm:inline">IA Co-pilot</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAIMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-reply-panel-dark rounded-xl shadow-2xl border-2 border-gray-200 dark:border-reply-border-dark overflow-hidden z-50">
              <div className="p-2 space-y-1">
                <button
                  onClick={() => {
                    onAICopilotClick('summarize');
                    setShowAIMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">Resumir Chat</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Genera resumen de la conversación</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onAICopilotClick('formal');
                    setShowAIMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">Tono Formal</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Reformula el mensaje</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onAICopilotClick('suggest');
                    setShowAIMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">Sugerir Respuesta</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">IA genera una respuesta</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1"></div>

        {/* Attachments Group */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            onClick={onMediaLibraryClick}
            className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300 transition-colors"
            title="Biblioteca Multimedia"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <button
            onClick={onAttachmentClick}
            className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300 transition-colors"
            title="Adjuntar Archivo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          <button
            onClick={onStickerClick}
            className="p-1.5 hover:bg-white dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300 transition-colors"
            title="Stickers"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>


        </div>
      </div>

      {/* Input Area */}
      <div className="flex items-end gap-3 rounded-2xl bg-reply-bg dark:bg-reply-surface-dark border border-gray-200 dark:border-reply-border-dark p-2 shadow-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500 dark:focus-within:ring-indigo-400 focus-within:border-transparent">
        
        {/* âœ… Action Button */}
        <ActionMenu 
            onSchedule={onSchedule}
            onProduct={onProduct}
            onRequestData={onRequestData}
            onPayment={onPayment}
            disabled={disabled}
        />

        <textarea
            placeholder="Escribe un mensaje..."
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || isRecording}
            rows={1}
            className="flex-1 bg-transparent focus:outline-none text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 dark:placeholder-gray-500 resize-none max-h-32 scrollbar-hide py-2"
            style={{ minHeight: '24px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              // target.style.height = Math.min(target.scrollHeight, 128) + 'px'; // Buggy flicker
              target.style.height = target.scrollHeight + 'px';
            }}
          />

        <div className="flex items-center gap-2 pb-1">
             {inputValue.trim() || selectedFile ? (
            <button
                onClick={onSend}
                disabled={disabled}
                className="text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 p-2 rounded-full hover:scale-105 active:scale-95 transition-transform shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
            </button>
            ) : (
            <button
                onClick={onVoiceNoteClick}
                disabled={disabled}
                className="text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
            </button>
            )}
        </div>
      </div>
    </div>
  );
};


