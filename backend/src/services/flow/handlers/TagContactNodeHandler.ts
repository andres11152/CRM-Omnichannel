import { FlowSessionState, FlowStructure, FlowNode } from "@/types/flow.types";
import { Logger } from "@/utils/logger";

export class TagContactNodeHandler {
  async handle(
    node: FlowNode,
    session: FlowSessionState,
    flowStructure: FlowStructure,
    moveToNextNode: (sId: string, cId: string, fs: FlowStructure) => Promise<void>
  ): Promise<string | null> {
    const tags = (node.data.tags || node.data.tag || "") as string;
    const tagList = tags.split(",").map((t: string) => t.trim()).filter(Boolean);

    if (tagList.length > 0 && session.contactId) {
      try {
        const { contactRepository } = await import("@/repositories/ContactRepository");
        const contact = await contactRepository.findFirst({
          where: { id: session.contactId, companyId: session.companyId },
          select: { tags: true },
        });

        const existingTags: string[] = Array.isArray(contact?.tags) ? (contact.tags as string[]) : [];
        const mergedTags = [...new Set([...existingTags, ...tagList])];

        await contactRepository.update(session.companyId, session.contactId, {
          tags: mergedTags,
        });

        Logger.info(`[FlowExec] TAG_CONTACT: Added [${tagList.join(", ")}] to contact ${session.contactId}`);
      } catch (error) {
        Logger.error(`[FlowExec] TAG_CONTACT failed:`, error);
      }
    }

    await moveToNextNode(session.id, node.id, flowStructure);
    return null;
  }
}
