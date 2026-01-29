import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import { prisma } from "@/config/database";

export const usePrismaAuthState = async (
  sessionId: string
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
      console.log(
        `[DB Auth] Reading ${key}: ${credential ? "FOUND" : "NOT FOUND"}`
      );
      if (!credential) return null;
      return JSON.parse(credential.value, BufferJSON.reviver);
    } catch (error) {
      console.error(`[DB Auth] Error reading ${type}-${id}`, error);
      return null;
    }
  };

  // Helper to write data to DB
  const writeData = async (type: string, id: string, data: any) => {
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
      console.error(`[DB Auth] Error writing ${key}`, error);
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
    } catch (error) {
      // Ignore delete errors (record might not exist)
    }
  };

  // InitialCreds
  const creds: AuthenticationCreds =
    (await readData("creds", "base")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids: string[]) => {
          const data: any = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(type, id);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data: any) => {
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
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData("creds", "base", creds);
    },
  };
};
