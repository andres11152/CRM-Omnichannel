import { prisma } from "@/config/database";
import { WhatsAppCredential, Prisma } from "@prisma/client";

/**
 * 🔐 WHATSAPP CREDENTIAL REPOSITORY
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

  async upsertMany(
    data: { sessionId: string; key: string; value: string }[],
  ): Promise<void> {
    const ops = data.map((d) =>
      prisma.whatsAppCredential.upsert({
        where: { sessionId_key: { sessionId: d.sessionId, key: d.key } },
        create: d,
        update: { value: d.value },
      }),
    );
    await prisma.$transaction(ops);
  }

  async deleteMany(sessionId: string): Promise<Prisma.BatchPayload> {
    return prisma.whatsAppCredential.deleteMany({ where: { sessionId } });
  }
}

export const whatsappCredentialRepository = new WhatsAppCredentialRepository();
