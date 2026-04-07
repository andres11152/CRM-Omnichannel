import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Platform = "ios" | "android" | "desktop";

interface PWAInstallState {
  isInstallable: boolean;
  isInstalled: boolean;
  platform: Platform;
  showIOSInstructions: boolean;
  installApp: () => Promise<void>;
  dismissIOSInstructions: () => void;
}

const detectPlatform = (): Platform => {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);

  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "desktop";
};

export const usePWAInstall = (): PWAInstallState => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const platform = detectPlatform();

  useEffect(() => {
    // Check if already installed (standalone mode)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone: boolean }).standalone) ||
      document.referrer.includes("android-app://");

    setIsInstalled(isStandalone);

    // iOS doesn't support beforeinstallprompt, so show instructions if not installed
    if (platform === "ios" && !isStandalone) {
      // Show iOS instructions after a delay (better UX)
      const timer = setTimeout(() => {
        setShowIOSInstructions(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    // Android/Desktop: Use standard beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
      console.log("[OK] PWA Install Prompt captured (Android/Desktop)");
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      setShowIOSInstructions(false);
      console.log(" PWA Installed successfully");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [platform]);

  const installApp = async () => {
    if (!deferredPrompt) {
      console.warn("[WARNING] No install prompt available");
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(
        `[APP] User ${outcome === "accepted" ? "accepted" : "dismissed"} installation`,
      );

      setDeferredPrompt(null);
      setIsInstallable(false);
    } catch (error) {
      console.error("[ERROR] Install prompt error:", error);
    }
  };

  const dismissIOSInstructions = () => {
    setShowIOSInstructions(false);
    // Remember dismissal in localStorage
    localStorage.setItem("pwa-ios-dismissed", "true");
  };

  return {
    isInstallable,
    isInstalled,
    platform,
    showIOSInstructions:
      showIOSInstructions &&
      localStorage.getItem("pwa-ios-dismissed") !== "true",
    installApp,
    dismissIOSInstructions,
  };
};
