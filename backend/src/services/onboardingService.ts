import { onboardingRepository } from "@/repositories/OnboardingRepository";
import { Logger } from "@/utils/logger";
import bcrypt from "bcryptjs";
import { cacheService } from "@/services/cacheService";

/**
 * 🚀 ONBOARDING SERVICE
 */
export const onboardingService = {
  async registerCompany(data: {
    companyName: string;
    adminEmail: string;
    adminPassword: string;
    plan?: string;
    slug?: string;
  }) {
    const planId = data.plan || "free";

    if (planId === "free") {
      await onboardingRepository.ensureFreePlanExists();
    }

    const hashedPassword = await bcrypt.hash(data.adminPassword, 12);

    // Atomic transaction: Company + Admin User
    const result = await onboardingRepository.executeOnboardingTransaction({
      companyName: data.companyName,
      slug: data.slug,
      planId,
      adminEmail: data.adminEmail,
      hashedPassword,
    });

    Logger.info(`[Onboarding] ✅ Created company: ${result.company.id}`);

    // Invalidate admin cache
    await cacheService.delete("admin:companies:all");

    return result;
  },
};
