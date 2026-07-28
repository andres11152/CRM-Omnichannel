import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { MessageActionsDropdown } from "./MessageActionsDropdown";

interface MessageActionsBarProps {
  isAgent: boolean;
  isRevoked: boolean;
  isPinned: boolean;
  isStarred: boolean;
  canStar: boolean;
  canEditOrDelete: boolean;
  hasOnPin: boolean;
  hasOnEdit: boolean;
  hasOnDelete: boolean;
  onPin: () => void;
  onStar: () => void;
  onTogglePicker: () => void;
  onReply: () => void;
  onEditStart: () => void;
  onDeleteRequest: () => void;
}

/**
 * WhatsApp Web style hover action trigger button (ChevronDown) and dropdown menu.
 * Appears on hover in the top-right corner of the message bubble.
 */
export const MessageActionsBar: React.FC<MessageActionsBarProps> = (props) => {
  const { isAgent } = props;
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  return (
    <div className={`absolute top-1 ${isAgent ? "left-1.5" : "right-1.5"} z-20`}>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`w-6 h-6 rounded-full flex items-center justify-center bg-white/90 dark:bg-[#233138]/95 backdrop-blur-md shadow-sm border border-gray-200/60 dark:border-white/10 text-gray-500 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-[#2a3942] transition-all duration-150 active:scale-95 ${
          isOpen ? "flex shadow-md text-indigo-600 dark:text-indigo-400" : "flex sm:hidden sm:group-hover/row:flex"
        }`}
        title="Opciones del mensaje"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      <MessageActionsDropdown
        {...props}
        isOpen={isOpen}
        buttonRef={buttonRef}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
};
