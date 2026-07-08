import { prisma } from "@/config/database";
import { runAsSystem } from "@/context/requestContext";

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
    // [SEC][FIX] Onboarding is a public, pre-auth route — tenantContextMiddleware
    // never sets an AsyncLocalStorage tenant context for it (by design, see
    // middleware/tenantContext.ts). `Company`/`Plan` are GLOBAL_MODELS and bypass
    // that check, but `User` is not, so `tx.user.create` below threw
    // "SECURITY VIOLATION: Access to User denied" inside the transaction — the
    // 500 reported when creating any new tenant. runAsSystem establishes the
    // "__SYSTEM__" context this system-level creation legitimately needs.
    // The callback MUST be `async` with an internal `await` — Prisma's client
    // methods return lazy thenables that only dispatch (and hit the tenant
    // extension) once something awaits them; a non-async callback lets that
    // happen outside runAsSystem's context window (see AdminService.ts).
    return runAsSystem(async () => {
      return await prisma.$transaction(async (tx) => {
        const newCompany = await tx.company.create({
          data: {
            name: data.companyName,
            slug: data.slug,
            planId: data.planId,
            trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day free trial by default
            status: "TRIAL",
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
    });
  },
};
