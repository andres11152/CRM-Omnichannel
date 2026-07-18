import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "UTC:yyyy-mm-dd HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

const THROTTLE_MS = 600000; // 10 minutes
const lastLogTimes = new Map<string, number>();

const errorCounts = new Map<string, { count: number; firstErrorTime: number }>();
const CORRUPTION_THRESHOLD = 50; 
const TRACKING_WINDOW_MS = 180000; 

const sessionCreationTimes = new Map<string, number>();
const MIN_SESSION_AGE_MS = 300000; 

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

          const corruptionPatterns = [
            "Bad MAC",
            "Decryption failed",
            "Session error",
            "No matching sessions",
            "failed to decrypt",
          ];

          if (corruptionPatterns.some((p) => msg.includes(p))) {
            const now = Date.now();

            if (!sessionCreationTimes.has(sessionId)) {
              sessionCreationTimes.set(sessionId, now);
            }

            const sessionAge = now - (sessionCreationTimes.get(sessionId) || now);
            if (sessionAge < MIN_SESSION_AGE_MS) {
              return;
            }
            
            const stats = errorCounts.get(sessionId) || { count: 0, firstErrorTime: now };
            if (now - stats.firstErrorTime > TRACKING_WINDOW_MS) {
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
            return;
          }

          original.apply(target, args);
        };
      }
      return original;
    },
  }) as pino.Logger;
}

export function cleanupSessionLogger(sessionId: string): void {
  errorCounts.delete(sessionId);
  lastLogTimes.delete(sessionId);
  sessionCreationTimes.delete(sessionId);
}

export const sessionModuleLogger = baseLogger;

const originalConsoleError = console.error;
console.error = function (...args: unknown[]) {
  if (typeof args[0] === "string" && (
    args[0].includes("Failed to decrypt message with any known session") ||
    args[0].includes("Session error:") ||
    args[0].includes("Bad MAC")
  )) {
    return;
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
    return;
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
    return;
  }
  originalConsoleInfo.apply(console, args);
};
