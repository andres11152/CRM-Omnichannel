import { Prisma } from "@prisma/client";
import { prisma, ExtendedPrismaClient } from "@/config/database";

/**
 * [SYNC] FLOW SESSION REPOSITORY
 *
 * Data access layer for ContactFlowSession, Workflow,
 * AIAssistant, AIConfig, Pipeline, and Stage models
 * used by the Flow Executor engine.
 */
export class FlowSessionRepository {
  constructor(private db: ExtendedPrismaClient = prisma) {}

  // ── ContactFlowSession ──

  async findSession(id: string) {
    return this.db.contactFlowSession.findUnique({ where: { id } });
  }

  async findSessionWithFlow(id: string) {
    return this.db.contactFlowSession.findUnique({
      where: { id },
      include: { flow: true },
    });
  }

  async findManySessions(args: Prisma.ContactFlowSessionFindManyArgs) {
    return this.db.contactFlowSession.findMany(args);
  }

  async findActiveSession(contactId: string) {
    return this.db.contactFlowSession.findFirst({
      where: { contactId, isActive: true },
      include: { flow: true },
      orderBy: { startedAt: "desc" },
    });
  }

  async updateSession(id: string, data: Prisma.ContactFlowSessionUpdateInput) {
    return this.db.contactFlowSession.update({ where: { id }, data });
  }

  async createSession(data: Prisma.ContactFlowSessionUncheckedCreateInput) {
    return this.db.contactFlowSession.create({ data });
  }

  async deleteSession(id: string) {
    return this.db.contactFlowSession.deleteMany({ where: { id } });
  }

  async deleteActiveSessions(contactId: string, flowId: string) {
    return this.db.contactFlowSession.deleteMany({
      where: { contactId, flowId, isActive: true },
    });
  }

  async deleteAllSessionsByContactAndFlow(contactId: string, flowId: string) {
    return this.db.contactFlowSession.deleteMany({
      where: { contactId, flowId },
    });
  }

  async completeSession(id: string) {
    return this.db.contactFlowSession.update({
      where: { id },
      data: { isActive: false, completedAt: new Date(), isPaused: false },
    });
  }

  async deactivateStaleSessions(cutoff: Date): Promise<number> {
    const result = await this.db.contactFlowSession.updateMany({
      where: {
        isActive: true,
        lastStepAt: { lt: cutoff },
      },
      data: {
        isActive: false,
        isPaused: false,
        completedAt: new Date(),
      },
    });
    return result.count;
  }

  // ── Workflow ──

  async findWorkflow(id: string) {
    return this.db.workflow.findUnique({ where: { id } });
  }

  async findActiveWorkflowsByTrigger(companyId: string, triggerType: string) {
    return this.db.workflow.findMany({
      where: { companyId, isActive: true, triggerType },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── AI ──

  async findAIAssistant(id: string) {
    return this.db.aIAssistant.findUnique({ where: { id } });
  }

  async findAIConfig(companyId: string) {
    return this.db.aIConfig.findUnique({ where: { companyId } });
  }

  // ── Pipeline / Stage / Deal ──

  async findDefaultPipeline(companyId: string) {
    return this.db.pipeline.findFirst({
      where: { companyId, isDefault: true },
    });
  }

  async findAnyPipeline(companyId: string) {
    return this.db.pipeline.findFirst({ where: { companyId } });
  }

  /** Validates a builder-chosen pipelineId actually belongs to this company. */
  async findPipelineById(pipelineId: string, companyId: string) {
    return this.db.pipeline.findFirst({ where: { id: pipelineId, companyId } });
  }

  async findFirstStage(pipelineId: string) {
    return this.db.stage.findFirst({
      where: { pipelineId },
      orderBy: { order: "asc" },
    });
  }

  /** Validates a builder-chosen stageId actually belongs to the target pipeline. */
  async findStageById(stageId: string, pipelineId: string) {
    return this.db.stage.findFirst({ where: { id: stageId, pipelineId } });
  }

  async createDeal(data: Prisma.DealCreateInput) {
    return this.db.deal.create({ data });
  }
}

export const flowSessionRepository = new FlowSessionRepository();
