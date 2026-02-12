import React, { useState, useEffect, useRef } from "react";
import { Bell, Check, X } from "lucide-react";
import { api } from "../../src/lib/axios";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../../hooks/useSocket";

/**
 * 🔔 NOTIFICATION BELL
 * Displays unread notification count and dropdown menu
 */

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link?: string | null;
  createdAt: string;
}

export const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const socket = useSocket();

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications();
  }, []);

  // Listen for real-time notifications
  useEffect(() => {
    if (socket) {
      socket.on("mention_notification", (data: any) => {
        // Add new notification to list
        const newNotification: Notification = {
          id: Date.now().toString(), // Temporary ID
          type: data.type,
          title: data.title,
          message: data.message,
          read: false,
          link: `/activities/${data.activityId}`,
          createdAt: data.timestamp,
        };

        setNotifications((prev) => [newNotification, ...prev]);
        setUnreadCount((prev) => prev + 1);

        // Optional: Show browser notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(data.title, {
            body: data.message,
            icon: "/logo.png",
          });
        }
      });

      return () => {
        socket.off("mention_notification");
      };
    }
  }, [socket]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await api.get("/notifications");

      if (response.data.status === "success") {
        const fetchedNotifications = response.data.data.notifications || [];
        setNotifications(fetchedNotifications);

        const unread = fetchedNotifications.filter(
          (n: Notification) => !n.read,
        ).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error("[NotificationBell] Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api.patch(`/notifications/${notificationId}/read`);

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("[NotificationBell] Error marking as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch("/notifications/read-all");

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("[NotificationBell] Error marking all as read:", error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);

    if (notification.link) {
      navigate(notification.link);
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        title="Notificaciones"
      >
        <Bell className="w-5 h-5" />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="fixed inset-x-4 top-16 mt-2 md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:w-96 bg-white dark:bg-[#202c33] rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-50 animate-fade-in origin-top-right">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notificaciones
            </h3>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Marcar todas leídas
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs text-gray-500 mt-2">Cargando...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No tienes notificaciones
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`
                    px-4 py-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer
                    hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
                    ${!notification.read ? "bg-indigo-50 dark:bg-indigo-900/10" : ""}
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-800 dark:text-white flex items-center gap-2">
                        {notification.title}
                        {!notification.read && (
                          <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                        )}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {new Date(notification.createdAt).toLocaleString(
                          "es-ES",
                          {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111b21]">
              <button
                onClick={() => {
                  navigate("/notifications");
                  setShowDropdown(false);
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline w-full text-center"
              >
                Ver todas las notificaciones
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
