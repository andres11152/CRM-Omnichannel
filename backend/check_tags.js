const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const contacts = await p.contact.findMany({
    select: { id: true, phone: true, tags: true },
  });

  const lines = [];
  for (const c of contacts) {
    const conv = await p.conversation.findFirst({
      where: { channelId: c.phone },
      select: { contactId: true },
    });
    const status = !conv
      ? "NO_CONV"
      : conv.contactId === c.id
        ? "OK"
        : conv.contactId
          ? "WRONG"
          : "UNLINKED";
    lines.push(c.phone + "|" + status + "|tags:" + c.tags.length);
  }

  require("fs").writeFileSync("tags_report.txt", lines.join("\n"), "utf8");
  console.log("Verify:");
  console.log(require("fs").readFileSync("tags_report.txt", "utf8"));

  await p.$disconnect();
}

main().catch(console.error);
