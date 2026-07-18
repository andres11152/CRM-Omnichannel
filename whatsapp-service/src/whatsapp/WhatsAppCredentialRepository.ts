import { prisma } from "../config/database";
import { randomUUID } from "crypto";

export interface WhatsAppCredential {
  id: string;
  sessionId: string;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

export class WhatsAppCredentialRepository {
  async findUnique(
    sessionId: string,
    key: string,
  ): Promise<WhatsAppCredential | null> {
    return prisma.whatsAppCredential.findUnique({
      where: { sessionId_key: { sessionId, key } },
    });
  }

  async findMany(
    sessionId: string,
    keys: string[],
  ): Promise<WhatsAppCredential[]> {
    return prisma.whatsAppCredential.findMany({
      where: {
        sessionId,
        key: { in: keys },
      },
    });
  }

  async upsert(
    sessionId: string,
    key: string,
    value: string,
  ): Promise<WhatsAppCredential> {
    return prisma.whatsAppCredential.upsert({
      where: { sessionId_key: { sessionId, key } },
      create: { sessionId, key, value },
      update: { value },
    });
  }

  async upsertMany(
    data: { sessionId: string; key: string; value: string }[],
  ): Promise<void> {
    if (data.length === 0) return;

    const CHUNK = 200;
    for (let i = 0; i < data.length; i += CHUNK) {
      const chunk = data.slice(i, i + CHUNK);
      const params: string[] = [];
      const tuples = chunk.map((d, idx) => {
        const base = idx * 4;
        params.push(randomUUID(), d.sessionId, d.key, d.value);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, NOW(), NOW())`;
      });

      const sql =
        `INSERT INTO "whatsapp_credentials" ("id", "sessionId", "key", "value", "createdAt", "updatedAt") ` +
        `VALUES ${tuples.join(", ")} ` +
        `ON CONFLICT ("sessionId", "key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()`;

      await prisma.$executeRawUnsafe(sql, ...params);
    }
  }

  async deleteMany(sessionId: string) {
    return prisma.whatsAppCredential.deleteMany({ where: { sessionId } });
  }

  async deleteKeys(
    sessionId: string,
    keys: string[],
  ) {
    return prisma.whatsAppCredential.deleteMany({
      where: {
        sessionId,
        key: { in: keys },
      },
    });
  }
}

export const whatsappCredentialRepository = new WhatsAppCredentialRepository();
