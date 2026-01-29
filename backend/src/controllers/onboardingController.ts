import { Request, Response } from "express";
import { prisma } from "@/config/database"; // Importar el cliente real de Prisma
import bcrypt from "bcryptjs";
import { catchAsync } from "@/utils/catchAsync";
import { AppError } from "@/utils/AppError";
import { cacheService } from "@/services/cacheService";

/**
 * SaaS ONBOARDING CONTROLLER
 * Handles the creation of new tenants (Companies) and their initial admin user.
 */
export const registerCompany = catchAsync(
  async (req: Request, res: Response) => {
    const { companyName, adminEmail, adminPassword, plan, slug } = req.body;

    if (!companyName || !adminEmail || !adminPassword) {
      throw new AppError(
        "Por favor, proporcione nombre de la compañía, email y contraseña del administrador.",
        400
      );
    }

    console.log(`[Onboarding] Starting registration for ${companyName}...`);

    // Ensure default plan exists if 'free' is requested
    const planId = plan || "free";
    if (planId === "free") {
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
    }

    // ATOMIC TRANSACTION
    // If User creation fails, Company creation is rolled back.
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create Company
      const newCompany = await tx.company.create({
        data: {
          name: companyName,
          slug: slug, // Use provided slug
          planId: planId,
        },
      });

      // 1. Hash admin password
      const hashedPassword = await bcrypt.hash(adminPassword, 12);

      // 2. Create Admin User linked to the Company
      const newAdmin = await tx.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          name: "Admin", // Default name for the initial admin
          role: "ADMIN",
          companyId: newCompany.id, // Link User to the new Company
        },
      });

      return { company: newCompany, user: newAdmin };
    });

    console.log(
      `[Onboarding] ✅ Successfully created company: ${result.company.id}`
    );

    // Invalidate Admin Cache so the new company appears in the dashboard immediately
    await cacheService.delete("admin:companies:all");

    // 3. Return success data (Do not return passwords or sensitive info)
    res.status(201).json({
      status: "success",
      message: "Compañía registrada exitosamente. Por favor, inicie sesión.",
      companyId: result.company.id,
      adminId: result.user.id,
    });
  }
);
