import type { Company, Plan, CompanyStatus, Prisma } from "@prisma/client";
import { Buffer } from "buffer";
import { prisma } from "@/config/prisma";
import { signToken } from "@/controllers/authController";

export const adminService = {
  // --- TENANT MANAGEMENT ---

  async getAllCompanies() {
    return prisma.company.findMany({
      include: {
        users: {
          where: { role: "ADMIN" },
          select: { email: true },
          take: 1,
        },
      },
    });
  },

  async updateCompanyStatus(companyId: string, status: CompanyStatus) {
    // La lógica ahora usa los valores del enum de Prisma
    const isActive = status === "ACTIVE" || status === "TRIAL";

    return prisma.company.update({
      where: { id: companyId },
      data: { status, isActive },
    });
  },

  async createCompany(data: Prisma.CompanyCreateInput) {
    const newCompany = await prisma.company.create({
      data: data,
    });
    console.log(`[Admin] Created Company: ${newCompany.name}.`);
    return newCompany;
  },

  // --- PLAN MANAGEMENT ---

  async getAllPlans() {
    return prisma.plan.findMany();
  },

  async savePlan(plan: Plan) {
    return prisma.plan.upsert({
      where: { id: plan.id },
      update: {
        // Especificamos explícitamente los campos a actualizar
        name: plan.name,
        price: plan.price,
        config: plan.config as Prisma.InputJsonValue, // Usamos una aserción de tipo para el campo JSON
      },
      create: {
        // Construimos el objeto de creación solo con los campos necesarios
        id: plan.id,
        name: plan.name,
        price: plan.price,
        config: plan.config as Prisma.InputJsonValue,
      },
    });
  },

  async deletePlan(planId: string) {
    return prisma.plan.delete({ where: { id: planId } });
  },

  // --- SECURITY: IMPERSONATION ---

  async generateImpersonationToken(targetCompanyId: string) {
    const adminUser = await prisma.user.findFirst({
      where: {
        companyId: targetCompanyId,
        role: "ADMIN",
      },
    });

    if (!adminUser) {
      // Fallback: try to find any user if no ADMIN exists
      const anyUser = await prisma.user.findFirst({
        where: { companyId: targetCompanyId },
      });

      if (!anyUser) {
        throw new Error("No se encontraron usuarios para esta empresa.");
      }

      const token = signToken({
        id: anyUser.id,
        role: anyUser.role,
        companyId: anyUser.companyId,
      });
      return { token, user: anyUser };
    }

    const token = signToken({
      id: adminUser.id,
      role: adminUser.role,
      companyId: adminUser.companyId,
    });

    return { token, user: adminUser };
  },
};
