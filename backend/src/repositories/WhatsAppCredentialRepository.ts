import { prisma } from "@/config/database";
import { WhatsAppCredential, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

/**
 * [AUTH] WHATSAPP CREDENTIAL REPOSITORY
 *
 * Handles all database operations for WhatsApp authentication credentials.
 * Used exclusively by AuthProvider for session key management.
 *
 * Security Notes:
 * - Values stored here are AES-256 encrypted
 * - Composite unique key: [sessionId, key]
 */
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

  /**
   * Bulk upsert credential keys in a SINGLE SQL statement per chunk via
   * INSERT ... ON CONFLICT DO UPDATE.
   *
   * [CRITICAL] On QR pairing Baileys writes hundreds of signal keys at once (e.g. ~800
   * pre-keys). The previous implementation ran `prisma.$transaction([...upsert])` with one
   * statement per key — a huge interactive transaction that overwhelmed the pooled Postgres
   * (Render) and threw "Connection closed", so credentials never persisted and the device
   * never linked. One parameterized multi-row statement per chunk is O(1) round-trips and
   * keeps the pool free. `id`/`updatedAt` are set explicitly since raw SQL bypasses Prisma's
   * @default(cuid()) / @updatedAt.
   */
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

  async deleteMany(sessionId: string): Promise<Prisma.BatchPayload> {
    return prisma.whatsAppCredential.deleteMany({ where: { sessionId } });
  }

  async deleteKeys(
    sessionId: string,
    keys: string[],
  ): Promise<Prisma.BatchPayload> {
    return prisma.whatsAppCredential.deleteMany({
      where: {
        sessionId,
        key: { in: keys },
      },
    });
  }
}

export const whatsappCredentialRepository = new WhatsAppCredentialRepository();
