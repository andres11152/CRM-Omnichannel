import { prisma } from "./src/config/prisma";

async function assignAdminToCompany() {
  try {
    // Find the company
    const company = await prisma.company.findFirst({
      where: { slug: "empresa-demo" },
    });

    if (!company) {
      console.log("❌ Company not found");
      return;
    }

    console.log(`Found company: ${company.name} (${company.id})`);

    // Find admin user
    const admin = await prisma.user.findUnique({
      where: { email: "admin@reply.com" },
    });

    if (!admin) {
      console.log("❌ Admin user not found");
      return;
    }

    console.log(`Found admin: ${admin.email}`);

    // Update admin to belong to company
    const updated = await prisma.user.update({
      where: { id: admin.id },
      data: { companyId: company.id },
    });

    console.log(
      `✅ Admin ${updated.email} assigned to company ${company.name}`
    );

    // Verify
    const users = await prisma.user.findMany({
      where: { companyId: company.id },
      select: { email: true, role: true },
    });

    console.log(`\nUsers in ${company.name}:`);
    users.forEach((u) => console.log(`  - ${u.email} (${u.role})`));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

assignAdminToCompany();
