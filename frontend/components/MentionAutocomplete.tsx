import React from 'react';
import { User } from 'lucide-react';

/**
 * 💬 MENTION AUTOCOMPLETE DROPDOWN
 * Shows team members suggestions when typing @username
 */

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface MentionSuggestion {
  user: TeamMember;
  matchScore: number;
}

interface Props {
  suggestions: MentionSuggestion[];
  selectedIndex: number;
  onSelect: (user: TeamMember) => void;
  onClose: () => void;
}

export const MentionAutocomplete: React.FC<Props> = ({
  suggestions,
  selectedIndex,
  onSelect,
  onClose,
}) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="absolute z-50 bg-white dark:bg-[#202c33] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl mt-1 overflow-hidden animate-fade-in">
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-[#111b21]">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Mencionar Usuario
        </p>
      </div>

      <ul className="max-h-64 overflow-y-auto">
        {suggestions.map((suggestion, index) => {
          const { user } = suggestion;
          const isSelected = index === selectedIndex;

          return (
            <li
              key={user.id}
              onClick={() => onSelect(user)}
              onMouseEnter={() => {}} // Could update selectedIndex on hover
              className={`
                flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }
              `}
            >
              {/* Avatar */}
              <div
                className={`
                w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold
                ${
                  isSelected
                    ? 'bg-indigo-500'
                    : 'bg-gradient-to-br from-blue-500 to-purple-600'
                }
              `}
              >
                {user.name
                  ? user.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .substring(0, 2)
                  : <User className="w-4 h-4" />}
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <p
                  className={`
                  font-medium text-sm truncate
                  ${
                    isSelected
                      ? 'text-indigo-700 dark:text-indigo-300'
                      : 'text-gray-800 dark:text-white'
                  }
                `}
                >
                  {user.name || 'Usuario'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user.email}
                </p>
              </div>

              {/* Selected Indicator */}
              {isSelected && (
                <div className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-[10px] font-mono">
                    ↵
                  </kbd>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Footer Hint */}
      <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-[#111b21] flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-[10px] font-mono">
              ↑↓
            </kbd>
            Navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-[10px] font-mono">
              ↵
            </kbd>
            Seleccionar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-[10px] font-mono">
              ESC
            </kbd>
            Cerrar
          </span>
        </div>
        <span>{suggestions.length} encontrado{suggestions.length !== 1 && 's'}</span>
      </div>
    </div>
  );
};
