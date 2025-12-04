import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany();

  const defaultReplies = [
    {
      title: "Saludo Inicial",
      content: "Hola, ¿en qué puedo ayudarte hoy?",
      category: "General",
    },
    {
      title: "Despedida",
      content: "Gracias por contactarnos. ¡Que tengas un buen día!",
      category: "General",
    },
    {
      title: "Pedir Detalles",
      content: "¿Podrías darme más detalles sobre el problema?",
      category: "Soporte",
    },
    {
      title: "Espera un momento",
      content: "Por favor, espera un momento mientras reviso tu caso.",
      category: "Soporte",
    },
    {
      title: "Precios",
      content:
        "Nuestros precios comienzan desde $29/mes. Puedes ver más en nuestra web.",
      category: "Ventas",
    },
  ];

  for (const company of companies) {
    console.log(`Checking replies for company: ${company.name}`);

    const existingReplies = await prisma.quickReply.count({
      where: { companyId: company.id },
    });

    if (existingReplies === 0) {
      console.log(`Seeding replies for ${company.name}...`);
      for (const reply of defaultReplies) {
        await prisma.quickReply.create({
          data: {
            ...reply,
            companyId: company.id,
          },
        });
      }
    } else {
      console.log(`Company ${company.name} already has replies.`);
    }
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
