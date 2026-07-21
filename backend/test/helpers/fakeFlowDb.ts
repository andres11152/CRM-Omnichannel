/**
 * In-memory fake persistence layer for Flow-engine tests.
 *
 * Unlike one-off `jest.fn().mockResolvedValueOnce(...)` scripting (the
 * pattern in `FlowExecutor.test.ts`), this is a genuinely STATEFUL fake: a
 * `updateSession()` call actually mutates the record a later `findSession()`
 * call will see. That's what makes it possible to drive a multi-turn,
 * multi-node conversation through the REAL `FlowNavigationService` /
 * `FlowTriggerService` / node handlers (not mocked) and get behavior that
 * matches production, instead of asserting against a hand-scripted mock
 * call sequence.
 *
 * `fakeDb` is a module-level singleton. Every `jest.mock(...)` factory in a
 * test file `require()`s this same module, and Node's require cache
 * guarantees they all get the identical instance — so a session created via
 * the (mocked) FlowSessionRepository is visible to the (mocked)
 * ContactRepository, etc., exactly like they'd share one Postgres.
 */

// Minimal untyped record shapes — deliberately loose (this is a JSON-in-DB
// system for nodes/edges anyway; see fixtures/flows.ts header).
/* eslint-disable @typescript-eslint/no-explicit-any */

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${++idCounter}`;

class FakeFlowDb {
  sessions = new Map<string, any>();
  workflows = new Map<string, any>();
  contacts = new Map<string, any>();
  conversations = new Map<string, any>();
  messages: any[] = [];
  aiAssistants = new Map<string, any>();
  aiConfigs = new Map<string, any>();
  pipelines = new Map<string, any>();
  stages = new Map<string, any>();
  deals: any[] = [];
  messageTemplates = new Map<string, any>();

  reset() {
    this.sessions.clear();
    this.workflows.clear();
    this.contacts.clear();
    this.conversations.clear();
    this.messages = [];
    this.aiAssistants.clear();
    this.aiConfigs.clear();
    this.pipelines.clear();
    this.stages.clear();
    this.deals = [];
    this.messageTemplates.clear();
    idCounter = 0;
  }

  // ── Seed helpers ──

  seedWorkflow(flow: any) {
    this.workflows.set(flow.id, { ...flow });
  }

  seedAIAssistant(agent: any) {
    this.aiAssistants.set(agent.id, { ...agent });
  }

  seedAIConfig(config: any) {
    this.aiConfigs.set(config.companyId, { ...config });
  }

  seedContact(contact: any) {
    this.contacts.set(contact.id, { tags: [], customFields: {}, ...contact });
  }

  seedConversation(conversation: any) {
    this.conversations.set(conversation.id, { ...conversation });
  }

  seedPipeline(pipeline: any) {
    this.pipelines.set(pipeline.id, { ...pipeline });
  }

  seedStage(stage: any) {
    this.stages.set(stage.id, { ...stage });
  }

  seedMessageTemplate(template: any) {
    this.messageTemplates.set(template.id ?? nextId("tmpl"), { channel: "WHATSAPP", ...template });
  }

  addMessage(message: any) {
    this.messages.push({ createdAt: new Date(), ...message });
  }

  // ── ContactFlowSession ──

  findSession(id: string) {
    return this.sessions.get(id) ?? null;
  }

  findSessionWithFlow(id: string) {
    const s = this.sessions.get(id);
    if (!s) return null;
    return { ...s, flow: this.workflows.get(s.flowId) ?? null };
  }

  findActiveSession(contactId: string) {
    const matches = [...this.sessions.values()]
      .filter((s) => s.contactId === contactId && s.isActive)
      .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
    const s = matches[0];
    if (!s) return null;
    return { ...s, flow: this.workflows.get(s.flowId) ?? null };
  }

  updateSession(id: string, data: Record<string, any>) {
    const existing = this.sessions.get(id);
    if (!existing) throw new Error(`FakeFlowDb: session ${id} not found`);
    const updated = { ...existing, ...data };
    this.sessions.set(id, updated);
    return updated;
  }

  createSession(data: Record<string, any>) {
    const id = nextId("sess");
    const record = {
      id,
      startedAt: new Date(),
      lastStepAt: new Date(),
      isPaused: false,
      pausedAt: null,
      completedAt: null,
      ...data,
    };
    this.sessions.set(id, record);
    return record;
  }

  deleteSession(id: string) {
    const existed = this.sessions.delete(id);
    return { count: existed ? 1 : 0 };
  }

  deleteActiveSessions(contactId: string, flowId: string) {
    let count = 0;
    for (const [id, s] of this.sessions) {
      if (s.contactId === contactId && s.flowId === flowId && s.isActive) {
        this.sessions.delete(id);
        count++;
      }
    }
    return { count };
  }

  deleteAllSessionsByContactAndFlow(contactId: string, flowId: string) {
    let count = 0;
    for (const [id, s] of this.sessions) {
      if (s.contactId === contactId && s.flowId === flowId) {
        this.sessions.delete(id);
        count++;
      }
    }
    return { count };
  }

  completeSession(id: string) {
    return this.updateSession(id, { isActive: false, completedAt: new Date(), isPaused: false });
  }

  // ── Workflow ──

  findWorkflow(id: string) {
    return this.workflows.get(id) ?? null;
  }

  findActiveWorkflowsByTrigger(companyId: string, triggerType: string) {
    return [...this.workflows.values()].filter(
      (w) => w.companyId === companyId && w.isActive && w.triggerType === triggerType,
    );
  }

  // ── AI ──

  findAIAssistant(id: string) {
    return this.aiAssistants.get(id) ?? null;
  }

  findAIConfig(companyId: string) {
    return this.aiConfigs.get(companyId) ?? null;
  }

  // ── Pipeline / Stage / Deal ──

  findDefaultPipeline(companyId: string) {
    return [...this.pipelines.values()].find((p) => p.companyId === companyId && p.isDefault) ?? null;
  }

  findAnyPipeline(companyId: string) {
    return [...this.pipelines.values()].find((p) => p.companyId === companyId) ?? null;
  }

  findFirstStage(pipelineId: string) {
    return (
      [...this.stages.values()]
        .filter((s) => s.pipelineId === pipelineId)
        .sort((a, b) => a.order - b.order)[0] ?? null
    );
  }

  findPipelineById(pipelineId: string, companyId: string) {
    const p = this.pipelines.get(pipelineId);
    return p && p.companyId === companyId ? p : null;
  }

  findStageById(stageId: string, pipelineId: string) {
    const s = this.stages.get(stageId);
    return s && s.pipelineId === pipelineId ? s : null;
  }

  findMessageTemplates(where: { companyId?: string; name?: string; channel?: string }) {
    return [...this.messageTemplates.values()].filter(
      (t) =>
        (!where.companyId || t.companyId === where.companyId) &&
        (!where.name || t.name === where.name) &&
        (!where.channel || t.channel === where.channel),
    );
  }

  createDeal(data: any) {
    const deal = {
      id: nextId("deal"),
      companyId: data.company?.connect?.id,
      pipelineId: data.pipeline?.connect?.id,
      stageId: data.stage?.connect?.id,
      title: data.title,
      value: data.value,
      currency: data.currency,
      createdAt: new Date(),
    };
    this.deals.push(deal);
    return deal;
  }

  // ── Contact ──

  findContactFirst(where: { id?: string; companyId?: string }) {
    const c = this.contacts.get(where.id ?? "");
    if (!c) return null;
    if (where.companyId && c.companyId !== where.companyId) return null;
    return c;
  }

  updateContact(companyId: string, contactId: string, data: Record<string, any>) {
    const existing = this.contacts.get(contactId);
    if (!existing || existing.companyId !== companyId) {
      throw new Error(`FakeFlowDb: contact ${contactId} not found for company ${companyId}`);
    }
    const updated = { ...existing, ...data };
    this.contacts.set(contactId, updated);
    return updated;
  }

  // ── Conversation ──

  updateConversation(companyId: string, conversationId: string, data: Record<string, any>) {
    const existing = this.conversations.get(conversationId);
    if (!existing || existing.companyId !== companyId) {
      throw new Error(`FakeFlowDb: conversation ${conversationId} not found for company ${companyId}`);
    }
    const updated = { ...existing, ...data };
    this.conversations.set(conversationId, updated);
    return updated;
  }

  // ── Messages ──

  findMessages(where: { conversationId?: string }, take?: number) {
    const filtered = this.messages
      .filter((m) => !where.conversationId || m.conversationId === where.conversationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return take ? filtered.slice(0, take) : filtered;
  }
}

export const fakeDb = new FakeFlowDb();
