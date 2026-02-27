import { prisma } from "@/config/database";

export const onboardingRepository = {
  async ensureFreePlanExists() {
    await prisma.plan.upsert({
      where: { id: "free" },
      update: {},
      create: {
        id: "free",
        name: "Free Plan",
        price: 0,
        config: {
          max_users: 2,
          max_queues: 1,
          storage_limit_gb: 1,
        },
      },
    });
  },

  async executeOnboardingTransaction(data: {
    companyName: string;
    slug?: string;
    planId: string;
    adminEmail: string;
    hashedPassword: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          name: data.companyName,
          slug: data.slug,
          planId: data.planId,
        },
      });

      const newAdmin = await tx.user.create({
        data: {
          email: data.adminEmail,
          password: data.hashedPassword,
          name: "Admin",
          role: "ADMIN",
          companyId: newCompany.id,
        },
      });

      return { company: newCompany, user: newAdmin };
    });
  },
};
