import React, { useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  LogOut,
  Sun,
  Moon,
  ChevronRight,
  ChevronLeft,
  GripVertical,
} from "lucide-react";
import { User } from "@/types/auth.types";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  navItems: Array<{
    id: string;
    path: string;
    icon: React.ReactNode;
    title: string;
    disabled?: boolean;
    badge?: string;
  }>;
  currentPath: string;
  onNavigate: (path: string) => void;
  onReorder: (result: DropResult) => void;
  user: User | null;
  logout: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

const NavIcon: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  isExpanded: boolean;
  disabled?: boolean;
  badge?: string;
  dragHandleProps?:
    | import("@hello-pangea/dnd").DraggableProvidedDragHandleProps
    | null;
}> = ({
  active,
  onClick,
  icon,
  title,
  isExpanded,
  disabled,
  badge,
  dragHandleProps,
}) => {
  return (
    <div
      className={`relative group w-full flex ${isExpanded ? "justify-start px-3" : "justify-center px-2"}`}
    >
      {/* Active Indicator (Left Border) */}
      {active && !disabled && (
        <div
          className={`absolute left-0 top-1/2 -translate-y-1/2 bg-reply-blue rounded-r-full transition-all duration-300 ${isExpanded ? "h-10 w-1" : "h-8 w-1"}`}
        />
      )}

      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={`
                    flex items-center gap-3 relative
                    transition-all duration-300 ease-out
                    ${
                      isExpanded
                        ? "w-full px-4 py-3 rounded-xl justify-start"
                        : "w-14 h-14 rounded-2xl justify-center"
                    }
                    ${
                      disabled
                        ? "opacity-50 grayscale cursor-not-allowed"
                        : active
                          ? "bg-blue-50 text-reply-blue dark:bg-blue-900/20 dark:text-blue-400 shadow-sm"
                          : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                    }
                `}
      >
        {/* Drag Handle (Only visible on hover) */}
        {!disabled && (
          <div
            {...dragHandleProps}
            className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 hover:!opacity-100 cursor-grab active:cursor-grabbing p-1 -ml-1.5"
          >
            {/* We might hide drag handle in expanded mode or style it differently */}
          </div>
        )}

        <div
          className={`flex-shrink-0 transition-transform duration-300 ${active && !isExpanded ? "scale-100" : "group-hover:scale-110"}`}
        >
          {icon}
        </div>

        {/* Text Label (Expanded Mode) */}
        <div
          className={`
                    flex flex-col items-start overflow-hidden whitespace-nowrap transition-all duration-300
                    ${isExpanded ? "w-auto opacity-100 translate-x-0" : "w-0 opacity-0 -translate-x-4"}
                `}
        >
          <span className="font-medium text-sm">{title}</span>
          {isExpanded && badge && (
            <span className="text-[10px] font-bold text-blue-500 dark:text-blue-400 leading-none mt-0.5">
              {badge}
            </span>
          )}
        </div>

        {/* Tooltip (Collapsed Mode ONLY) */}
        {!isExpanded && (
          <div className="absolute left-16 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl translate-x-2 group-hover:translate-x-0">
            <div className="flex flex-col">
              <span>{title}</span>
              {badge && (
                <span className="text-[10px] text-blue-300 font-bold">
                  {badge}
                </span>
              )}
            </div>
            {/* Arrow */}
            <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 bg-gray-900 transform rotate-45" />
          </div>
        )}
      </button>
    </div>
  );
};

export const SidebarEnhanced: React.FC<SidebarProps> = ({
  navItems,
  currentPath,
  onNavigate,
  onReorder,
  user,
  logout,
  darkMode,
  toggleDarkMode,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
}) => {
  // Local State for Expansion
  const [isExpanded, setIsExpanded] = useState(false);
  const { t, i18n } = useTranslation();

  return (
    <>
      {/* BACKDROP (Mobile) */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[90] md:hidden transition-opacity duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <DragDropContext onDragEnd={onReorder}>
        <Droppable droppableId="sidebar">
          {(provided) => (
            <aside
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`
                                fixed md:static inset-y-0 left-0 z-[100] h-full
                                bg-white dark:bg-reply-surface-dark flex flex-col py-6
                                border-r border-gray-200/60 dark:border-reply-border-dark shadow-xl md:shadow-none
                                transition-[width,transform] duration-300 ease-spring
                                ${isExpanded ? "md:w-64" : "md:w-[88px]"}
                                ${isMobileMenuOpen ? "w-64 translate-x-0" : "-translate-x-full md:translate-x-0 w-[88px]"}
                            `}
            >
              {/* HEADER: LOGO & TOGGLE */}
              <div
                className={`flex items-center mb-6 transition-all duration-300 ${isExpanded ? "justify-between px-6" : "flex-col gap-4 px-2 justify-center"}`}
              >
                {/* Brand Logo */}
                <div
                  className="cursor-pointer hover:scale-105 transition-transform duration-300 flex items-center gap-3 overflow-hidden"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <svg
                    viewBox="0 0 100 100"
                    fill="none"
                    className="w-10 h-10 flex-shrink-0 drop-shadow-md"
                  >
                    <path
                      d="M25 65C25 51.19 36.19 40 50 40H60C62.76 40 65 42.24 65 45V65C65 78.81 53.81 90 40 90H25V65Z"
                      className="fill-blue-600 dark:fill-blue-500"
                    />
                    <path
                      d="M40 50C40 36.19 51.19 25 65 25H75L90 10L85 50H75C72.24 50 70 52.24 70 55V60C70 68.28 63.28 75 55 75H40V50Z"
                      className="fill-teal-400"
                    />
                  </svg>

                  {/* App Name with Fade Effect */}
                  {isExpanded && (
                    <span className="font-bold text-xl text-gray-800 dark:text-white whitespace-nowrap transition-all duration-300 animate-in fade-in slide-in-from-left-2">
                      Reply
                    </span>
                  )}
                </div>

                {/* Desktop Toggle Button */}
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className={`
                                    hidden md:flex items-center justify-center p-1.5 rounded-lg 
                                    bg-gray-100 dark:bg-gray-800 text-gray-500 
                                    hover:text-blue-600 dark:hover:text-blue-400 transition-colors shadow-sm
                                    ${isExpanded ? "" : "w-8 h-8 rounded-full"}
                                `}
                >
                  {isExpanded ? (
                    <ChevronLeft size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
              </div>

              {/* Nav Items Scrollable Area */}
              <div className="flex-1 w-full overflow-y-auto overflow-x-hidden scrollbar-hide flex flex-col gap-1 pb-4">
                {navItems.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        style={provided.draggableProps.style}
                        className={`transition-all duration-200 ${snapshot.isDragging ? "z-50 opacity-90 scale-105" : ""}`}
                      >
                        <NavIcon
                          active={currentPath.startsWith(item.path)}
                          onClick={() => {
                            onNavigate(item.path);
                            setIsMobileMenuOpen(false);
                          }}
                          icon={item.icon}
                          title={t(`navigation.${item.id}`, item.title)}
                          disabled={item.disabled}
                          badge={item.badge ? t(`common.coming_soon`, item.badge) : undefined}
                          isExpanded={isExpanded || isMobileMenuOpen}
                          dragHandleProps={provided.dragHandleProps}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>

              {/* Footer Actions */}
              <div
                className={`mt-auto pt-4 border-t border-gray-100 dark:border-reply-border-dark w-full flex flex-col gap-2 transition-all duration-300 ${isExpanded || isMobileMenuOpen ? "px-4" : "px-0 items-center"}`}
              >
                {/* Dark Mode Toggle */}
                <button
                  onClick={toggleDarkMode}
                  className={`
                                        flex items-center gap-3 p-3 text-gray-400 rounded-xl transition-all duration-300
                                        hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 dark:hover:text-yellow-400
                                        ${isExpanded || isMobileMenuOpen ? "w-full justify-start" : "w-14 justify-center"}
                                    `}
                  title={darkMode ? t("sidebar.light_mode", "Modo Claro") : t("sidebar.dark_mode", "Modo Oscuro")}
                >
                  {darkMode ? (
                    <Moon size={20} className="flex-shrink-0" />
                  ) : (
                    <Sun size={20} className="flex-shrink-0" />
                  )}
                  <span
                    className={`whitespace-nowrap font-medium text-sm transition-all duration-300 ${isExpanded || isMobileMenuOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}
                  >
                    {darkMode ? t("sidebar.light_mode", "Modo Claro") : t("sidebar.dark_mode", "Modo Oscuro")}
                  </span>
                </button>

                {/* Language Toggle (i18n POC) */}
                <button
                  onClick={() => {
                    const nextLang = i18n.language === "es" ? "en" : "es";
                    i18n.changeLanguage(nextLang);
                  }}
                  className={`
                                        flex items-center gap-3 p-3 text-gray-400 rounded-xl transition-all duration-300
                                        hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400
                                        ${isExpanded || isMobileMenuOpen ? "w-full justify-start" : "w-14 justify-center"}
                                    `}
                  title={t("sidebar.change_language", "Cambiar Idioma")}
                >
                  <div className="flex items-center justify-center font-black text-xs uppercase w-5 h-5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0">
                    {i18n.language || "es"}
                  </div>
                  <span
                    className={`whitespace-nowrap font-medium text-sm transition-all duration-300 ${isExpanded || isMobileMenuOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}
                  >
                    {i18n.language === "es" ? "English" : "Español"}
                  </span>
                </button>

                {/* User Profile (Clickable & Above Logout) */}
                <button
                  onClick={() => onNavigate("/profile")}
                  className={`
                      hidden md:flex mt-2 items-center gap-3 p-2 rounded-xl border 
                      transition-all duration-300 w-full group
                      ${
                        currentPath === "/profile"
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                          : "border-transparent hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
                      }
                      ${
                        isExpanded || isMobileMenuOpen
                          ? "justify-start"
                          : "justify-center"
                      }
                    `}
                >
                  <div
                    className={`
                    w-9 h-9 flex-shrink-0 rounded-full p-[2px] shadow-sm transition-transform duration-300 group-hover:scale-105
                    ${
                      currentPath === "/profile"
                        ? "bg-gradient-to-tr from-blue-600 to-teal-500"
                        : "bg-gradient-to-tr from-blue-500 to-teal-400"
                    }
                  `}
                  >
                    <div className="w-full h-full rounded-full bg-white dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 relative overflow-hidden">
                      {user?.profilePicUrl || user?.avatar ? (
                        <img
                          src={user?.profilePicUrl || user?.avatar}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>
                          {user?.name?.slice(0, 2).toUpperCase() || "US"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    className={`flex flex-col items-start overflow-hidden transition-all duration-300 ${isExpanded || isMobileMenuOpen ? "opacity-100 w-auto" : "opacity-0 w-0"}`}
                  >
                    <span
                      className={`text-sm font-semibold truncate ${currentPath === "/profile" ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-gray-200"}`}
                    >
                      {user?.name || t("sidebar.user", "Usuario")}
                    </span>
                    <span
                      className={`text-xs truncate font-medium ${currentPath === "/profile" ? "text-blue-500 dark:text-blue-400" : "text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400"}`}
                    >
                      {t("sidebar.view_profile", "Ver Perfil")}
                    </span>
                  </div>
                </button>

                {/* Logout (Last Item) */}
                <button
                  onClick={logout}
                  className={`
                                        flex items-center gap-3 p-3 text-gray-400 rounded-xl transition-all duration-300
                                        hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20
                                        ${isExpanded || isMobileMenuOpen ? "w-full justify-start" : "w-14 justify-center"}
                                    `}
                  title={t("sidebar.logout", "Cerrar Sesión")}
                >
                  <LogOut size={20} className="flex-shrink-0" />
                  <span
                    className={`whitespace-nowrap font-medium text-sm transition-all duration-300 ${isExpanded || isMobileMenuOpen ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"}`}
                  >
                    {t("sidebar.logout", "Cerrar Sesión")}
                  </span>
                </button>
              </div>
            </aside>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );
};
