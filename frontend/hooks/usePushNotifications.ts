import { useState, useEffect } from "react";
import axios from "axios";

/**
 * 🔔 USE PUSH NOTIFICATIONS HOOK
 * Manages PWA push notification subscriptions
 */

interface UsePushNotificationsReturn {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  requestPermission: () => Promise<NotificationPermission>;
}

export const usePushNotifications = (): UsePushNotificationsReturn => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");

  useEffect(() => {
    // Check if push notifications are supported
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setIsSupported(supported);

    if (supported) {
      // Get initial permission state
      setPermission(Notification.permission);

      // Check if already subscribed
      checkSubscription();
    }
  }, []);

  /**
   * Check if user has an active subscription
   */
  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Failed to check subscription:", error);
    }
  };

  /**
   * Request notification permission
   */
  const requestPermission = async (): Promise<NotificationPermission> => {
    if (!isSupported) {
      console.warn("Push notifications not supported");
      return "denied";
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.error("Failed to request permission:", error);
      return "denied";
    }
  };

  /**
   * Subscribe to push notifications
   */
  const subscribe = async () => {
    if (!isSupported) {
      alert("Push notifications are not supported in this browser");
      return;
    }

    setIsLoading(true);

    try {
      // Request permission if not granted
      let perm = permission;
      if (perm !== "granted") {
        perm = await requestPermission();
      }

      if (perm !== "granted") {
        alert("Please enable notifications to receive important updates");
        setIsLoading(false);
        return;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Get VAPID public key from backend
      const { data } = await axios.get(
        "/api/push-notifications/vapid-public-key"
      );
      const publicKey = data.publicKey;

      // Subscribe to push manager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      // Send subscription to backend
      await axios.post("/api/push-notifications/subscribe", {
        subscription: subscription.toJSON(),
      });

      setIsSubscribed(true);
      console.log("Successfully subscribed to push notifications");
    } catch (error) {
      console.error("Failed to subscribe:", error);
      alert("Failed to enable push notifications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Unsubscribe from push notifications
   */
  const unsubscribe = async () => {
    if (!isSupported) return;

    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push manager
        await subscription.unsubscribe();

        // Notify backend
        await axios.post("/api/push-notifications/unsubscribe", {
          endpoint: subscription.endpoint,
        });

        setIsSubscribed(false);
        console.log("Successfully unsubscribed from push notifications");
      }
    } catch (error) {
      console.error("Failed to unsubscribe:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    requestPermission,
  };
};

/**
 * Utility: Convert base64 string to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Utility: Register service worker
 */
export const registerServiceWorker =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (!("serviceWorker" in navigator)) {
      console.warn("Service workers not supported");
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.register(
        "/service-worker.js"
      );
      console.log("Service Worker registered:", registration);
      return registration;
    } catch (error) {
      console.error("Service Worker registration failed:", error);
      return null;
    }
  };
