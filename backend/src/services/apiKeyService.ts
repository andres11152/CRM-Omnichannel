import { auditLogService } from "./AuditLogService";
import { apiKeyRepository } from "@/repositories/ApiKeyRepository";
import cryptoModule from "crypto"; // To avoid naming conflicts

/**
 * [KEY] API KEY CRUD SERVICE
 */
export const apiKeyService = {
  async findAll(companyId: string) {
    return await apiKeyRepository.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async create(companyId: string, userId?: string, name?: string) {
    const rawKey = "sk_live_" + cryptoModule.randomBytes(24).toString("hex");
    const keyPrefix = rawKey.substring(0, 15) + "...";
    const keyHash = cryptoModule
      .createHash("sha256")
      .update(rawKey)
      .digest("hex");

    const apiKey = await apiKeyRepository.create({
      data: {
        companyId,
        name: name || "API Key",
        keyPrefix,
        keyHash,
      },
    });

    void auditLogService.log({
      companyId,
      userId,
      action: "CREATE",
      entity: "ApiKey",
      entityId: apiKey.id,
      details: { name: apiKey.name, prefix: apiKey.keyPrefix },
    });

    return { ...apiKey, secretKey: rawKey };
  },

  async revoke(id: string, companyId: string, userId?: string) {
    await apiKeyRepository.deleteMany({ where: { id, companyId } });

    void auditLogService.log({
      companyId,
      userId,
      action: "DELETE",
      entity: "ApiKey",
      entityId: id,
      details: { event: "API key revoked" },
    });
  },
};
