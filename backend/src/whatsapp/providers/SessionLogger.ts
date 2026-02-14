import pino from "pino";

/**
 * 🛡️ SESSION LOGGER FACTORY
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

/**
 * Creates a healer-enabled logger for a specific WhatsApp session.
 *
 * Instead of letting Baileys crash the session on decryption errors,
 * we intercept them, log a warning, and let Baileys retry internally.
 */
export function createSessionLogger(sessionId: string): pino.Logger {
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
                  ? `${a.message} ${a.stack}`
                  : typeof a === "object"
                    ? JSON.stringify(a)
                    : "",
            )
            .join(" ");

          // 🚨 DETECT CORRUPTION SIGNATURES
          const corruptionPatterns = [
            "Bad MAC",
            "Decryption failed",
            "Session error",
            "No matching sessions",
            "failed to decrypt",
          ];

          if (corruptionPatterns.some((p) => msg.includes(p))) {
            // 🛡️ ARMOR MODE: Do NOT nuke the session.
            // Log a warning and let Baileys handle retry/drop.
            baseLogger.warn(
              `[SessionGuard] 🛡️ Decryption error intercepted in Session ${sessionId}: "${msg.substring(0, 100)}..." - IGNORING.`,
            );
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
