import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const userId = "cmijsybeg00019c6uisdpalje"; // ID from previous log
  const newPhone = "573138081081";
  const newEmail = `${newPhone}@whatsapp.user`;

  console.log(`🔍 Updating user ${userId} to email ${newEmail}...`);

  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { email: newEmail, name: newPhone },
    });
    console.log("✅ User updated:", updatedUser);
  } catch (error) {
    console.error("❌ Update failed:", error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
