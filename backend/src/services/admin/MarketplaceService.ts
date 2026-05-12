import { templateRepository } from "@/repositories/TemplateRepository";
import { workflowRepository } from "@/repositories/WorkflowRepository";
import { Prisma } from "@prisma/client";
import { Logger } from "@/utils/logger";
import { AppError } from "@/utils/AppError";

export class MarketplaceService {
  async getGlobalInventory() {
    const templates = await templateRepository.findMany({
      where: { isGlobal: true },
      include: { company: { select: { name: true } } }
    });

    const workflows = await workflowRepository.findMany({
      where: { isGlobal: true },
      include: { company: { select: { name: true } } }
    });

    return { templates, workflows };
  }

  /**
   * Distribute all global templates to a specific company
   * This is typically called during onboarding (tenant creation)
   */
  async distributeToCompany(companyId: string) {
    try {
      Logger.info(`[Marketplace] Distributing global templates to company ${companyId}`);

      // 1. Distribute Message Templates (WhatsApp/Email)
      const globalTemplates = await templateRepository.findMany({
        where: { isGlobal: true }
      });

      if (globalTemplates.length > 0) {
        const templatesToCreate = globalTemplates.map(t => ({
          companyId,
          name: t.name,
          channel: t.channel,
          subject: t.subject,
          language: t.language,
          category: t.category,
          status: "approved",
          components: t.components as Prisma.InputJsonValue,
          isGlobal: false // The clone belongs to the tenant and is not global
        }));

        await templateRepository.createMany({
          data: templatesToCreate
        });
      }

      // 2. Distribute Workflows (Automation Flows)
      const globalWorkflows = await workflowRepository.findMany({
        where: { isGlobal: true }
      });

      for (const wf of globalWorkflows) {
        await workflowRepository.create({
          data: {
            companyId,
            name: wf.name,
            description: wf.description,
            isActive: true,
            isGlobal: false,
            triggerType: wf.triggerType,
            triggerConfig: wf.triggerConfig as Prisma.InputJsonValue,
            nodes: wf.nodes as Prisma.InputJsonValue,
            edges: wf.edges as Prisma.InputJsonValue
          }
        });
      }

      Logger.info(`[Marketplace] Distribution complete for ${companyId}: ${globalTemplates.length} templates, ${globalWorkflows.length} flows.`);
      return { templates: globalTemplates.length, workflows: globalWorkflows.length };
    } catch (error) {
      Logger.error(`[Marketplace] Critical failure during template distribution for company ${companyId}`, error);
      throw new AppError("Error en la distribución de plantillas maestras", 500);
    }
  }

  /**
   * Toggle global status for a specific template
   */
  async toggleTemplateGlobal(templateId: string, isGlobal: boolean) {
    return templateRepository.update({
      where: { id: templateId },
      data: { isGlobal }
    });
  }

  /**
   * Toggle global status for a specific workflow
   */
  async toggleWorkflowGlobal(workflowId: string, isGlobal: boolean) {
    return workflowRepository.update({
      where: { id: workflowId },
      data: { isGlobal }
    });
  }
}

export const marketplaceService = new MarketplaceService();
