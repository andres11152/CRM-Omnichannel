/* eslint-disable no-restricted-globals */
/**
 * 🔔 SERVICE WORKER - PUSH NOTIFICATIONS
 * Handles push notifications for Sentry CRM PWA
 */

// Listen for push events
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    const options = {
      body: data.body,
      icon: data.icon || "/icon-192x192.png",
      badge: data.badge || "/badge-72x72.png",
      vibrate: [200, 100, 200],
      tag: data.tag || "notification",
      data: data.data || {},
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || [],
      timestamp: data.timestamp || Date.now(),
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
  } catch (error) {
    console.error("Error showing notification:", error);
  }
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data;

  // Handle different actions
  let url = "/";

  if (action === "view" || !action) {
    // Default action: open relevant page
    switch (data.type) {
      case "message":
        url = "/conversations";
        break;
      case "ticket":
        url = `/tickets/${data.ticketId || ""}`;
        break;
      case "campaign":
        url = "/campaigns";
        break;
      case "quota":
        url = "/settings/billing";
        break;
      case "whatsapp":
        url = "/settings/whatsapp";
        break;
      default:
        url = "/";
    }
  } else if (action === "reply") {
    url = "/conversations";
  } else if (action === "upgrade") {
    url = "/settings/billing";
  } else if (action === "reconnect") {
    url = "/settings/whatsapp";
  }

  // Open window or focus existing one
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }

        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Handle notification close
self.addEventListener("notificationclose", (event) => {
  console.log("Notification closed:", event.notification.tag);

  // Send analytics if needed
  const data = event.notification.data;
  if (data && data.type) {
    // Track notification dismissal
    fetch("/api/analytics/notification-dismissed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: data.type,
        tag: event.notification.tag,
      }),
    }).catch((error) => {
      console.error("Failed to track notification dismissal:", error);
    });
  }
});

// Install event
self.addEventListener("install", (event) => {
  console.log("[ServiceWorker] Installed");
  self.skipWaiting();
});

// Activate event
self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activated");
  event.waitUntil(self.clients.claim());
});
