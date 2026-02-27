import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  makeCacheableSignalKeyStore,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { prisma } from "@/config/database";
import { sessionModuleLogger } from "@/whatsapp/providers/SessionLogger";

export const usePrismaAuthState = async (
  sessionId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  // Helper to read data from DB
  const readData = async (type: string, id: string) => {
    try {
      const key = `${type}-${id}`;
      const credential = await prisma.whatsAppCredential.findUnique({
        where: {
          sessionId_key: {
            sessionId: sessionId,
            key: key,
          },
        },
      });
      sessionModuleLogger.debug(
        `[DB Auth] Reading ${key}: ${credential ? "FOUND" : "NOT FOUND"}`,
      );
      if (!credential) return null;
      return JSON.parse(credential.value, BufferJSON.reviver);
    } catch (error) {
      sessionModuleLogger.error(
        error as Error,
        `[DB Auth] Error reading ${type}-${id}`,
      );
      return null;
    }
  };

  // Helper to write data to DB
  const writeData = async (type: string, id: string, data: unknown) => {
    const key = `${type}-${id}`;
    const value = JSON.stringify(data, BufferJSON.replacer);

    try {
      await prisma.whatsAppCredential.upsert({
        where: {
          sessionId_key: {
            sessionId: sessionId,
            key: key,
          },
        },
        update: { value },
        create: { sessionId, key, value },
      });
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
      await prisma.whatsAppCredential.delete({
        where: {
          sessionId_key: {
            sessionId: sessionId,
            key: key,
          },
        },
      });
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
