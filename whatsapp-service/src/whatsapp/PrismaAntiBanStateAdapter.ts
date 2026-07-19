import { prisma } from "../config/database";

export class PrismaAntiBanStateAdapter {
  constructor(private readonly sessionId: string) {}

  async load(key: string): Promise<any> {
    const record = await prisma.whatsAppCredential.findUnique({
      where: {
        sessionId_key: {
          sessionId: this.sessionId,
          key: `antiban:${key}`,
        },
      },
    });

    if (!record) {
      throw new Error(`Key ${key} not found for session ${this.sessionId}`);
    }

    return JSON.parse(record.value);
  }

  async save(key: string, data: any): Promise<void> {
    const serialized = JSON.stringify(data);
    await prisma.whatsAppCredential.upsert({
      where: {
        sessionId_key: {
          sessionId: this.sessionId,
          key: `antiban:${key}`,
        },
      },
      create: {
        sessionId: this.sessionId,
        key: `antiban:${key}`,
        value: serialized,
      },
      update: {
        value: serialized,
      },
    });
  }
}
