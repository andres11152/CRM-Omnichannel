
import { Request, Response } from 'express';
import { prisma } from '@/../prisma'; // Importar el cliente real de Prisma
import bcrypt from 'bcryptjs';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/AppError';


/**
 * SaaS ONBOARDING CONTROLLER
 * Handles the creation of new tenants (Companies) and their initial admin user.
 */
export const registerCompany = catchAsync(async (req: Request, res: Response) => {
  const { companyName, adminEmail, adminPassword, plan } = req.body;

  if (!companyName || !adminEmail || !adminPassword) {
    throw new AppError('Por favor, proporcione nombre de la compañía, email y contraseña del administrador.', 400);
  }

  console.log(`[Onboarding] Starting registration for ${companyName}...`);

  // ATOMIC TRANSACTION
  // If User creation fails, Company creation is rolled back.
  const result = await prisma.$transaction(async (tx: any) => {
    // 1. Create Company
    const newCompany = await tx.company.create({
      data: {
        name: companyName,
        planId: plan || 'free', // Default to a free plan if not specified
      },
    });

    // 1. Hash admin password
    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    // 2. Create Admin User linked to the Company
    const newAdmin = await tx.user.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: 'Admin', // Default name for the initial admin
        role: 'ADMIN',
        companyId: newCompany.id, // Link User to the new Company
      },
    });

    return { company: newCompany, user: newAdmin };
  });

  console.log(`[Onboarding] ✅ Successfully created company: ${result.company.id}`);

  // 3. Return success data (Do not return passwords or sensitive info)
  res.status(201).json({
    status: 'success',
    message: 'Compañía registrada exitosamente. Por favor, inicie sesión.',
    companyId: result.company.id,
    adminId: result.user.id,
  });
});
