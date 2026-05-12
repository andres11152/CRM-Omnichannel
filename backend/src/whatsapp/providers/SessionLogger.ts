import pino from "pino";

/**
 * [SEC] SESSION LOGGER FACTORY
 *
 * Creates a proxied Pino logger that intercepts Baileys internal errors
 * in order to detect session corruption (Bad MAC, decryption failures, etc.)
 *
 * Extracted from SessionManager.ts for SRP compliance.
 */

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
});

const THROTTLE_MS = 600000; // 10 minutes
const lastLogTimes = new Map<string, number>();

// [SEC] CORRUPTION TRACKER
const errorCounts = new Map<string, { count: number; firstErrorTime: number }>();
const CORRUPTION_THRESHOLD = 20; // Errors in 1 min
const TRACKING_WINDOW_MS = 60000; // 1 minute

/**
 * Creates a healer-enabled logger for a specific WhatsApp session.
 * 
 * Intercepts Baileys decryption errors to detect session desync.
 * If too many failures happen, signals for a session nuke/reconnect.
 */
export function createSessionLogger(
  sessionId: string,
  onCorruptionDetected?: (sessionId: string) => void,
): pino.Logger {
  const innerLogger = pino({ level: "error" });

  return new Proxy(innerLogger, {
    get: (target, prop, receiver) => {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original === "function" && prop === "error") {
        return (...args: unknown[]) => {
          const msg = args
            .map((a) =>
              typeof a === "string"
                ? a
                : a instanceof Error
                  ? `${a.message}`
                  : typeof a === "object"
                    ? JSON.stringify(a)
                    : "",
            )
            .join(" ");

          // [ALERT] DETECT CORRUPTION SIGNATURES
          const corruptionPatterns = [
            "Bad MAC",
            "Decryption failed",
            "Session error",
            "No matching sessions",
            "failed to decrypt",
          ];

          if (corruptionPatterns.some((p) => msg.includes(p))) {
            const now = Date.now();
            
            // [SEC] TRACK CORRUPTION FREQUENCY
            const stats = errorCounts.get(sessionId) || { count: 0, firstErrorTime: now };
            if (now - stats.firstErrorTime > TRACKING_WINDOW_MS) {
              // Reset window
              stats.count = 1;
              stats.firstErrorTime = now;
            } else {
              stats.count++;
            }
            errorCounts.set(sessionId, stats);

            if (stats.count >= CORRUPTION_THRESHOLD) {
              errorCounts.delete(sessionId);
              baseLogger.error(
                `[SessionGuard] CRITICAL: Persistent corruption in Session ${sessionId} (${stats.count} errors). Triggering Self-Healing Nuke...`,
              );
              onCorruptionDetected?.(sessionId);
              return;
            }

            const lastLog = lastLogTimes.get(sessionId) || 0;
            if (now - lastLog > THROTTLE_MS) {
              lastLogTimes.set(sessionId, now);
              baseLogger.warn(
                `[SessionGuard] Intercepted decryption error in Session ${sessionId} (Count: ${stats.count}). IGNORING.`,
              );
            }
            return; // Suppress the loud error
          }

          // Call original logger for non-corruption errors
          original.apply(target, args);
        };
      }
      return original;
    },
  }) as pino.Logger;
}

/** Shared module-level logger for SessionManager / ConnectionHealer */
export const sessionModuleLogger = baseLogger;

// ────────────────────────────────────────────────
// GLOBALLY SUPPRESS LIBSIGNAL SPAM
// ────────────────────────────────────────────────
// libsignal uses hardcoded console.error and console.warn inside its
// node_modules code, bypassing Pino completely. We intercept them here.
const originalConsoleError = console.error;
console.error = function (...args: unknown[]) {
  if (typeof args[0] === "string" && (
    args[0].includes("Failed to decrypt message with any known session") ||
    args[0].includes("Session error:") ||
    args[0].includes("Bad MAC")
  )) {
    return; // Completely suppress libsignal "Bad MAC" stack traces
  }
  originalConsoleError.apply(console, args);
};

const originalConsoleWarn = console.warn;
console.warn = function (...args: unknown[]) {
  if (typeof args[0] === "string" && (
    args[0].includes("Unhandled bucket type") ||
    args[0].includes("Session already closed") ||
    args[0].includes("Session already open") ||
    args[0].includes("Decrypted message with closed session") ||
    args[0].includes("Closing stale open session") ||
    args[0].includes("Closing open session in favor of incoming")
  )) {
    return; // Suppress harmless libsignal warnings
  }
  originalConsoleWarn.apply(console, args);
};

const originalConsoleInfo = console.info;
console.info = function (...args: unknown[]) {
  if (typeof args[0] === "string" && (
    args[0].includes("Closing session:") ||
    args[0].includes("Opening session:") ||
    args[0].includes("Removing old closed session:")
  )) {
    return; // Suppress extremely verbose libsignal session lifecycle info logs
  }
  originalConsoleInfo.apply(console, args);
};
