import React, { useState } from "react";
import { Minus, Plus } from "lucide-react";

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  className?: string;
}

export const FilterSection: React.FC<FilterSectionProps> = ({
  title,
  children,
  defaultOpen = false,
  count,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-100 dark:border-reply-border-dark last:border-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-reply-bg dark:hover:bg-gray-700/50 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider group-hover:text-gray-700 dark:group-hover:text-gray-300">
            {title}
          </span>
          {count !== undefined && count > 0 && (
            <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        {isOpen ? (
          <Minus className="w-3 h-3 text-gray-400 group-hover:text-indigo-500" />
        ) : (
          <Plus className="w-3 h-3 text-gray-400 group-hover:text-indigo-500" />
        )}
      </button>
      {isOpen && (
        <div
          className={`animate-in slide-in-from-top-1 fade-in duration-200 ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  );
};
