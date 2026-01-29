import { IAuthProvider } from "../core/interfaces/IAuthProvider";
import {
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
  AuthenticationCreds,
} from "@whiskeysockets/baileys";
import { prisma } from "@/config/database";

export class DatabaseAuthProvider implements IAuthProvider {
  async loadState(sessionId: string): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const savedCreds = await this.loadCredsFromDB(sessionId);

    const state: AuthenticationState = {
      creds: savedCreds || initAuthCreds(),
      keys: {
        get: async (type, ids) => {
          const data: Record<string, SignalDataTypeMap[typeof type]> = {};

          for (const id of ids) {
            const key = `${type}-${id}`;
            const credential = await prisma.whatsAppCredential.findUnique({
              where: { sessionId_key: { sessionId, key } },
            });

            if (credential?.value) {
              try {
                data[id] = JSON.parse(credential.value, BufferJSON.reviver);
              } catch (e) {
                console.error(`[AuthProvider] Failed to parse ${key}:`, e);
              }
            }
          }

          return data;
        },

        set: async (data) => {
          const operations = [];

          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;

              operations.push(
                prisma.whatsAppCredential.upsert({
                  where: { sessionId_key: { sessionId, key } },
                  create: {
                    sessionId,
                    key,
                    value: JSON.stringify(value, BufferJSON.replacer),
                  },
                  update: {
                    value: JSON.stringify(value, BufferJSON.replacer),
                  },
                }),
              );
            }
          }

          try {
            await prisma.$transaction(operations);
          } catch (error) {
            console.error(
              `[AuthProvider] ❌ Failed to save keys for ${sessionId}:`,
              error,
            );
          }
        },
      },
    };

    const saveCreds = async () => {
      await this.saveCredentials(sessionId, state.creds);
    };

    return { state, saveCreds };
  }

  async saveCredentials(
    sessionId: string,
    creds: AuthenticationCreds,
  ): Promise<void> {
    await prisma.whatsAppCredential.upsert({
      where: { sessionId_key: { sessionId, key: "creds" } },
      create: {
        sessionId,
        key: "creds",
        value: JSON.stringify(creds, BufferJSON.replacer),
      },
      update: {
        value: JSON.stringify(creds, BufferJSON.replacer),
      },
    });
  }

  async clearCredentials(sessionId: string): Promise<void> {
    await prisma.whatsAppCredential.deleteMany({
      where: { sessionId },
    });
  }

  private async loadCredsFromDB(
    sessionId: string,
  ): Promise<AuthenticationCreds | null> {
    const credential = await prisma.whatsAppCredential.findUnique({
      where: { sessionId_key: { sessionId, key: "creds" } },
    });

    if (!credential) return null;

    try {
      return JSON.parse(credential.value, BufferJSON.reviver);
    } catch (e) {
      console.error(
        `[AuthProvider] Failed to parse creds for ${sessionId}:`,
        e,
      );
      return null;
    }
  }
}
