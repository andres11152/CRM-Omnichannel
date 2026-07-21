import React from "react";
import { useTranslation } from "react-i18next";
import { Contact } from "@/types";
import { Avatar } from "@/components/common/Avatar";

interface ContactIdentityProps {
  contact: Contact;
  onEditContact: () => void;
  socketStatus: "connected" | "disconnected";
  isChatListVisible: boolean;
  isCustomer360Visible: boolean;
  isTyping: boolean;
}

export const ContactIdentity: React.FC<ContactIdentityProps> = ({
  contact,
  onEditContact,
  socketStatus,
  isChatListVisible,
  isCustomer360Visible,
  isTyping,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center gap-2 sm:gap-3 group cursor-pointer hover:bg-reply-bg dark:hover:bg-gray-800/50 p-1 rounded-lg transition-colors overflow-hidden"
      onClick={onEditContact}
    >
      <div className={`relative shrink-0 ${isChatListVisible && isCustomer360Visible ? "hidden 2xl:block" : "block"}`}>
        <Avatar
          src={contact.profilePicUrl || contact.avatarUrl || null}
          name={contact.name}
          className="w-8 h-8 sm:w-9 sm:h-9 border-2 border-white dark:border-gray-600 shadow-sm"
        />
        <div
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-white dark:border-reply-panel-dark ${socketStatus === "connected" ? "bg-green-500" : "bg-red-500"}`}
        ></div>
      </div>

      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-gray-900 dark:text-white font-bold text-sm truncate">
            {contact.isGroup ? contact.name.replace(/^\[GROUP\]\s*/i, "") : contact.name}
          </h2>
          {contact.channel && (
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase shrink-0">
              {contact.channel}
            </span>
          )}
        </div>

        {/* [SEC] WhatsApp-Style: Typing indicator + Tags coexist */}
        <div className="flex flex-col gap-0.5">
          {/* Typing Indicator — Always shows when active, above tags */}
          {isTyping && (
            <div className="flex items-center gap-1.5 h-4 overflow-hidden">
              <span className="text-[11px] text-green-500 dark:text-green-400 font-semibold italic tracking-tight animate-pulse">
                {t("chat.typing", "escribiendo")}
              </span>
              <span className="flex gap-[3px] items-end h-3">
                <span className="w-[4px] h-[4px] bg-green-500 dark:bg-green-400 rounded-full animate-bounce" style={{ animationDuration: "0.6s" }}></span>
                <span
                  className="w-[4px] h-[4px] bg-green-500 dark:bg-green-400 rounded-full animate-bounce"
                  style={{ animationDuration: "0.6s", animationDelay: "0.15s" }}
                ></span>
                <span
                  className="w-[4px] h-[4px] bg-green-500 dark:bg-green-400 rounded-full animate-bounce"
                  style={{ animationDuration: "0.6s", animationDelay: "0.3s" }}
                ></span>
              </span>
            </div>
          )}

          {/* Tags moved to dedicated bar below header */}
        </div>
      </div>
    </div>
  );
};
