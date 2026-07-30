import { contactRepository } from "@/repositories/ContactRepository";
import { Logger } from "@/utils/logger";

/**
 * Portable core of the "Tag Contact" node — no dependency on a chatbot
 * session or a CRM deal. Shared by TagContactNodeHandler (chatbot) and
 * TagContactActionHandler (CRM workflows) so tag add/remove semantics
 * can't drift between the two engines.
 */
export async function applyContactTags(
  companyId: string,
  contactId: string,
  tagsCsv: string,
  action: "add" | "remove" = "add",
): Promise<void> {
  const tagList = tagsCsv
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (tagList.length === 0) return;

  const contact = await contactRepository.findFirst({
    where: { id: contactId, companyId },
    select: { tags: true },
  });

  const existingTags: string[] = Array.isArray(contact?.tags)
    ? (contact.tags as string[])
    : [];
  const resultTags =
    action === "remove"
      ? existingTags.filter((t) => !tagList.includes(t))
      : [...new Set([...existingTags, ...tagList])];

  await contactRepository.update(companyId, contactId, { tags: resultTags });

  Logger.info(
    `[NodeAction:TagContact] ${action === "remove" ? "Removed" : "Added"} [${tagList.join(", ")}] ${action === "remove" ? "from" : "to"} contact ${contactId}`,
  );
}
