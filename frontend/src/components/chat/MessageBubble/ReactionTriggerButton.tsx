import React from "react";
import { Smile } from "lucide-react";

interface ReactionTriggerButtonProps {
  isAgent: boolean;
  isOpen?: boolean;
  onTogglePicker: () => void;
}

/**
 * Hover trigger button for quick emoji reactions.
 * Controlled by side wrapper position in index.tsx.
 */
export const ReactionTriggerButton: React.FC<ReactionTriggerButtonProps> = ({
  isOpen,
  onTogglePicker,
}) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onTogglePicker();
      }}
      className={`w-7 h-7 rounded-full items-center justify-center bg-white dark:bg-[#233138] shadow-sm border border-gray-200/60 dark:border-white/10 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-all duration-150 active:scale-90 ${
        isOpen ? "flex shadow-md text-indigo-600 dark:text-indigo-400" : "flex sm:hidden sm:group-hover/row:flex"
      }`}
      title="Reaccionar"
    >
      <Smile className="w-4 h-4" />
    </button>
  );
};
