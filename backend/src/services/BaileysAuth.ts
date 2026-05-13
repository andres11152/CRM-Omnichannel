import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  makeCacheableSignalKeyStore,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { whatsappCredentialRepository } from "@/repositories/WhatsAppCredentialRepository";
import { sessionModuleLogger } from "@/whatsapp/providers/SessionLogger";
import { encrypt, decrypt } from "@/utils/cryptoUtils";

/**
 * [SEC] LEGACY BAILEYS AUTH STATE ADAPTER
 *
 * @deprecated Use DatabaseAuthProvider (AuthProvider.ts) for new sessions.
 * This module is kept ONLY for backward compatibility with sessions
 * that were created before the enterprise auth migration.
 *
 * SECURITY NOTE: Now uses AES-256-GCM encryption via cryptoUtils.
 * Old unencrypted values are detected and re-encrypted on first read (transparent migration).
 */

/**
 * Checks if a stored value is already encrypted (contains IV:AuthTag:Ciphertext or v1:IV:AuthTag:Ciphertext format).
 */
const isEncryptedValue = (value: string): boolean => {
  const parts = value.split(":");
  return parts.length === 3 || (parts.length === 4 && parts[0] === "v1");
};

export const usePrismaAuthState = async (
  sessionId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  // Helper to read data from DB
  const readData = async (type: string, id: string) => {
    try {
      const key = `${type}-${id}`;
      const credential = await whatsappCredentialRepository.findUnique(
        sessionId,
        key,
      );
      sessionModuleLogger.debug(
        `[DB Auth] Reading ${key}: ${credential ? "FOUND" : "NOT FOUND"}`,
      );
      if (!credential || !credential.value) return null;

      // [SEC] Transparent decryption with legacy plaintext fallback
      let rawJson: string;

      if (isEncryptedValue(credential.value)) {
        const decrypted = decrypt(credential.value, sessionId);
        if (!decrypted) {
          sessionModuleLogger.error(
            `[DB Auth] Decryption failed for ${key}. Session may be corrupted.`,
          );
          return null;
        }
        rawJson = decrypted;
      } else {
        // Legacy plaintext value — parse it and re-encrypt on next write
        rawJson = credential.value;
        sessionModuleLogger.warn(
          `[DB Auth] [SEC] Plaintext credential detected for ${key}. Will be encrypted on next write.`,
        );
      }

      return JSON.parse(rawJson, BufferJSON.reviver);
    } catch (error) {
      sessionModuleLogger.error(
        error as Error,
        `[DB Auth] Error reading ${type}-${id}`,
      );
      return null;
    }
  };

  // Helper to write data to DB — NOW ALWAYS ENCRYPTS
  const writeData = async (type: string, id: string, data: unknown) => {
    const key = `${type}-${id}`;
    const json = JSON.stringify(data, BufferJSON.replacer);
    const encrypted = encrypt(json, sessionId);

    try {
      await whatsappCredentialRepository.upsert(sessionId, key, encrypted);
    } catch (error) {
      sessionModuleLogger.error(
        error as Error,
        `[DB Auth] Error writing ${key}`,
      );
    }
  };

  // Remove data
  const removeData = async (type: string, id: string) => {
    const key = `${type}-${id}`;
    try {
      await whatsappCredentialRepository.upsert(sessionId, key, ""); // Soft-delete by clearing value
    } catch {
      // Ignore delete errors (record might not exist)
    }
  };

  // InitialCreds
  const creds: AuthenticationCreds =
    (await readData("creds", "base")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: makeCacheableSignalKeyStore(
        {
          get: async <T extends keyof SignalDataTypeMap>(
            type: T,
            ids: string[],
          ) => {
            const data: { [id: string]: SignalDataTypeMap[T] } = {};
            await Promise.all(
              ids.map(async (id) => {
                let value = await readData(type, id);
                if (type === "app-state-sync-key" && value) {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
                data[id] = value as SignalDataTypeMap[T];
              }),
            );
            return data;
          },
          set: async (data: Record<string, Record<string, unknown>>) => {
            const tasks: Promise<void>[] = [];
            for (const category in data) {
              for (const id in data[category]) {
                const value = data[category][id];
                if (value) {
                  tasks.push(writeData(category, id, value));
                } else {
                  tasks.push(removeData(category, id));
                }
              }
            }
            await Promise.allSettled(tasks);
          },
        },
        sessionModuleLogger.child({ session: sessionId }),
      ),
    },
    saveCreds: async () => {
      await writeData("creds", "base", creds);
    },
  };
};
