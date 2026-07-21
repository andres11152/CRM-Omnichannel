/**
 * REAL-WORLD FLOW SIMULATION — every node type, driven exactly the way
 * BullMQ + a real WhatsApp conversation would drive it.
 *
 * Unlike `FlowExecutor.test.ts` (which mocks `FlowNavigationService` /
 * `FlowTriggerService` / `FlowNodeHandlers` at the class level to test the
 * orchestrator's loop/timeout/yield logic in isolation), this suite mocks
 * ONLY the true I/O boundary — repositories, `fetch`, and the AI SDKs — and
 * lets the REAL navigation/trigger/handler code run against a stateful
 * in-memory fake DB (`test/helpers/fakeFlowDb.ts`). That's what actually
 * proves the 17 node types + both CONDITION modes work end-to-end, not just
 * that the orchestrator calls the right mock.
 *
 * Two live conversations exercise both branches of the fixture flow
 * (`test/fixtures/flows.ts`):
 *   - Contact A: "casa" branch, budget qualifies HIGH → assign_agent (queue)
 *   - Contact B: "apartamento" branch, budget qualifies LOW → ai_handoff
 *
 * The remaining blocks are regression tests for fixes applied after mapping
 * this system found several frontend/backend field-name mismatches (the UI
 * wrote one field, the handler read another, so configuring something in the
 * builder silently had no effect) plus a validation-boundary bug where a flow
 * shaped exactly like the visual builder produces it could not be saved at
 * all. Each of these now asserts the FIXED behavior — if a future change
 * reintroduces the mismatch, the corresponding test fails.
 */

import { fakeDb } from "./helpers/fakeFlowDb";
import { CreateFlowSchema } from "../src/schemas/flowSchema";
import {
  realEstateLeadFlow,
  fieldMismatchFlow,
  advancedFieldsFlow,
  mockAIAssistantGemini,
  mockAIConfig,
  AI_ASSISTANT_ID,
  COMPANY_ID,
} from "./fixtures/flows";

// ── Queue: no real BullMQ/Redis. We simulate the worker firing by calling
// flowExecutor.resumeSession() ourselves wherever scheduleResume was called. ──
jest.mock("../src/services/queue/flowQueueService", () => ({
  flowQueueService: { scheduleResume: jest.fn() },
}));

// ── Cache: passthrough (wrap just executes the callback; no real Redis). ──
jest.mock("../src/services/CacheService", () => ({
  cacheService: {
    wrap: jest.fn((_key: string, cb: () => unknown) => cb()),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

// ── Repositories: wired to the shared in-memory fake DB. ──
jest.mock("../src/repositories/FlowSessionRepository", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports; require() is the only way to reach the shared fake DB singleton here
  const { fakeDb } = require("./helpers/fakeFlowDb");
  return {
    flowSessionRepository: {
      findSession: jest.fn((id: string) => fakeDb.findSession(id)),
      findSessionWithFlow: jest.fn((id: string) => fakeDb.findSessionWithFlow(id)),
      findActiveSession: jest.fn((contactId: string) => fakeDb.findActiveSession(contactId)),
      updateSession: jest.fn((id: string, data: unknown) => fakeDb.updateSession(id, data)),
      createSession: jest.fn((data: unknown) => fakeDb.createSession(data)),
      deleteSession: jest.fn((id: string) => fakeDb.deleteSession(id)),
      deleteActiveSessions: jest.fn((c: string, f: string) => fakeDb.deleteActiveSessions(c, f)),
      deleteAllSessionsByContactAndFlow: jest.fn((c: string, f: string) =>
        fakeDb.deleteAllSessionsByContactAndFlow(c, f),
      ),
      completeSession: jest.fn((id: string) => fakeDb.completeSession(id)),
      findWorkflow: jest.fn((id: string) => fakeDb.findWorkflow(id)),
      findActiveWorkflowsByTrigger: jest.fn((c: string, t: string) => fakeDb.findActiveWorkflowsByTrigger(c, t)),
      findAIAssistant: jest.fn((id: string) => fakeDb.findAIAssistant(id)),
      findAIConfig: jest.fn((c: string) => fakeDb.findAIConfig(c)),
      findDefaultPipeline: jest.fn((c: string) => fakeDb.findDefaultPipeline(c)),
      findAnyPipeline: jest.fn((c: string) => fakeDb.findAnyPipeline(c)),
      findFirstStage: jest.fn((p: string) => fakeDb.findFirstStage(p)),
      findPipelineById: jest.fn((id: string, c: string) => fakeDb.findPipelineById(id, c)),
      findStageById: jest.fn((id: string, p: string) => fakeDb.findStageById(id, p)),
      createDeal: jest.fn((data: unknown) => fakeDb.createDeal(data)),
    },
  };
});

jest.mock("../src/repositories/MessageTemplateRepository", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports; require() is the only way to reach the shared fake DB singleton here
  const { fakeDb } = require("./helpers/fakeFlowDb");
  return {
    messageTemplateRepository: {
      findMany: jest.fn((args: { where?: { companyId?: string; name?: string; channel?: string } }) =>
        fakeDb.findMessageTemplates(args.where ?? {}),
      ),
    },
  };
});

jest.mock("../src/repositories/ContactRepository", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports; require() is the only way to reach the shared fake DB singleton here
  const { fakeDb } = require("./helpers/fakeFlowDb");
  return {
    contactRepository: {
      findFirst: jest.fn((args: { where: { id: string; companyId?: string } }) =>
        fakeDb.findContactFirst(args.where),
      ),
      update: jest.fn((companyId: string, contactId: string, data: unknown) =>
        fakeDb.updateContact(companyId, contactId, data),
      ),
    },
  };
});

jest.mock("../src/repositories/ConversationRepository", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports; require() is the only way to reach the shared fake DB singleton here
  const { fakeDb } = require("./helpers/fakeFlowDb");
  return {
    conversationRepository: {
      update: jest.fn((companyId: string, conversationId: string, data: unknown) =>
        fakeDb.updateConversation(companyId, conversationId, data),
      ),
    },
  };
});

jest.mock("../src/repositories/MessageRepository", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports; require() is the only way to reach the shared fake DB singleton here
  const { fakeDb } = require("./helpers/fakeFlowDb");
  return {
    messageRepository: {
      findMany: jest.fn((args: { where?: { conversationId?: string }; take?: number }) =>
        fakeDb.findMessages(args.where ?? {}, args.take),
      ),
    },
  };
});

// ── AI SDKs ──
const mockGeminiSendMessage = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  startChat: jest.fn().mockReturnValue({
    sendMessage: mockGeminiSendMessage,
  }),
});
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

import { flowExecutor } from "../src/services/FlowExecutor";
import { flowQueueService } from "../src/services/queue/flowQueueService";

const geminiTextResult = (text: string) => ({ response: { text: () => text } });

describe("Flow engine — real-world multi-node simulation", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fakeDb.reset();
    mockGeminiSendMessage.mockReset();

    fakeDb.seedWorkflow(realEstateLeadFlow);
    fakeDb.seedAIAssistant(mockAIAssistantGemini);
    fakeDb.seedAIConfig(mockAIConfig);
    fakeDb.seedPipeline({ id: "pipe_default", companyId: COMPANY_ID, isDefault: true });
    fakeDb.seedStage({ id: "stage_new", pipelineId: "pipe_default", order: 0, name: "Nuevo" });

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ received: true }),
      text: async () => "{}",
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  /**
   * Drives one full conversation through the fixture flow. Every OUTPUT node
   * (send_message/image/video/audio/document) yields one result and schedules
   * a resume (we fire it manually, standing in for the BullMQ worker);
   * ASK_DATA questions pause waiting for a real inbound reply instead.
   */
  async function runConversation(opts: {
    contactId: string;
    conversationId: string;
    propertyType: string; // "casa" or "apartamento"
    budgetAnswer: string;
    geminiFirstReply: string; // non-terminating
    geminiFinalReply: string; // contains TERMINAR + [DATA: {...}]
  }) {
    const { contactId, conversationId, propertyType, budgetAnswer, geminiFirstReply, geminiFinalReply } = opts;

    fakeDb.seedContact({ id: contactId, companyId: COMPANY_ID, name: "Lead", tags: [] });
    fakeDb.seedConversation({ id: conversationId, companyId: COMPANY_ID, status: "OPEN" });

    const transcript: Array<{ from: "bot" | "user"; text: string }> = [];
    const say = async (userText: string) => {
      const results = await flowExecutor.processMessage(contactId, userText, conversationId, COMPANY_ID);
      transcript.push({ from: "user", text: userText });
      for (const r of results) transcript.push({ from: "bot", text: typeof r === "string" ? r : JSON.stringify(r) });
      return results;
    };
    const resume = async () => {
      const sessionId = fakeDb.findActiveSession(contactId)?.id;
      if (!sessionId) return [];
      const results = await flowExecutor.resumeSession(sessionId);
      for (const r of results) transcript.push({ from: "bot", text: typeof r === "string" ? r : JSON.stringify(r) });
      return results;
    };

    // 1. Trigger keyword → n_welcome (send_message, yields + schedules resume)
    let out = await say("hola");
    expect(out).toEqual(["¡Hola! Bienvenido a Sentry Realty 🏠. Te ayudo a encontrar tu propiedad ideal."]);

    // 2. Resume → n_ask_type (ASK_DATA, pauses waiting for real reply — no schedule)
    out = await resume();
    expect(out).toEqual(["¿Qué tipo de propiedad buscas? (casa/apartamento)"]);

    // 3. Real reply consumed → n_branch (CONDITION, silent) → n_img_house|n_img_apto (OUTPUT)
    out = await say(propertyType);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "image" });

    // 4. Resume → n_video (OUTPUT)
    out = await resume();
    expect(out[0]).toMatchObject({ type: "video", url: "https://cdn.sentryrealty.test/tour.mp4" });

    // 5. Resume → n_audio (OUTPUT)
    out = await resume();
    expect(out[0]).toMatchObject({ type: "audio", url: "https://cdn.sentryrealty.test/proceso.ogg" });

    // 6. Resume → n_ask_budget (ASK_DATA, pauses)
    out = await resume();
    expect(out).toEqual(["¿Cuál es tu presupuesto aproximado en USD?"]);

    // 7. Real reply consumed → chains silently through n_document(OUTPUT, yields)
    out = await say(budgetAnswer);
    expect(out[0]).toMatchObject({ type: "document", filename: "catalogo.pdf" });

    // 8. Resume → n_deal(silent, CREATE_DEAL) → n_tag(silent) → n_update(silent)
    //    → n_webhook(silent, HTTP_REQUEST) → n_template(silent) → n_delay(silent, pauses+schedules)
    //    None of these are OUTPUT_NODE_TYPES so they all chain in one loop with NO text output,
    //    except n_deal's `confirmation` text, which DOES flow through as a result even though
    //    CREATE_DEAL is a SILENT type (its non-null return is pushed but doesn't cause a yield/break).
    out = await resume();
    expect(out).toContain("Registramos tu interés."); // n_deal confirmation
    expect(flowQueueService.scheduleResume).toHaveBeenCalled(); // n_delay scheduled it

    // Assert the silent-node side effects actually happened for real:
    expect(fakeDb.deals).toHaveLength(1);
    expect(fakeDb.deals[0]).toMatchObject({ pipelineId: "pipe_default", stageId: "stage_new" });
    expect(fakeDb.deals[0].title).toBe(`Lead: ${propertyType} - USD ${budgetAnswer}`);

    const contactAfterTag = fakeDb.contacts.get(contactId);
    expect(contactAfterTag.tags).toEqual(expect.arrayContaining(["lead-caliente", "inmobiliaria"]));
    expect(contactAfterTag.name).toBe(`${propertyType} Lead`);
    expect(contactAfterTag.customFields).toMatchObject({ leadSource: "whatsapp-bot" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://crm.external.test/leads",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: propertyType, budget: budgetAnswer }),
      }),
    );

    // 9. Resume (n_delay's scheduled continuation) → n_ai (AI_AGENT, first pass: non-terminating)
    mockGeminiSendMessage.mockResolvedValueOnce(geminiTextResult(geminiFirstReply));
    out = await resume();
    expect(out).toEqual([geminiFirstReply]);
    // AI_AGENT does NOT call flowQueueService — it pauses waiting for the user's next message directly.

    // 10. Real follow-up reply → AI re-invoked, this time terminates → n_qualify (CONDITION, advanced mode)
    mockGeminiSendMessage.mockResolvedValueOnce(geminiTextResult(geminiFinalReply));
    out = await say("sí, ese es mi presupuesto");
    return { out, transcript, sessionAfter: fakeDb.findActiveSession(contactId) };
  }

  it("casa branch + high budget → routes to assign_agent (queue) and ends the session", async () => {
    const { out, sessionAfter } = await runConversation({
      contactId: "contact_a",
      conversationId: "conv_a",
      propertyType: "casa",
      budgetAnswer: "350000",
      geminiFirstReply: "¿Podrías confirmar tu presupuesto exacto?",
      geminiFinalReply: '[DATA: {"qualified_budget": 350000}] TERMINAR',
    });

    // n_qualify(advanced CONDITION) routed via sourceHandle "high" → n_assign_queue,
    // which ends the session and returns its message.
    expect(out).toEqual(["Un asesor senior te contactará en breve."]);

    const conv = fakeDb.conversations.get("conv_a");
    expect(conv).toMatchObject({ status: "OPEN", queueId: "queue_ventas_premium", assignedToId: null });

    // Session ended (ASSIGN_AGENT is terminal).
    expect(sessionAfter).toBeNull();
  });

  it("apartamento branch + low budget → routes to ai_handoff and ends the session", async () => {
    const { out, sessionAfter } = await runConversation({
      contactId: "contact_b",
      conversationId: "conv_b",
      propertyType: "apartamento",
      budgetAnswer: "150000",
      geminiFirstReply: "Entiendo, ¿ese presupuesto es negociable?",
      geminiFinalReply: '[DATA: {"qualified_budget": 150000}] TERMINAR',
    });

    // n_qualify routed via sourceHandle "low" → n_handoff.
    expect(out).toEqual(["Te conectamos con un agente para ver opciones dentro de tu presupuesto."]);

    const conv = fakeDb.conversations.get("conv_b");
    expect(conv).toMatchObject({ status: "IN_PROGRESS" });
    expect(sessionAfter).toBeNull();
  });

  it("send_template with no matching approved WhatsApp template configured: warns and advances silently (fail-open, no crash)", async () => {
    fakeDb.seedContact({ id: "contact_tmpl_missing", companyId: COMPANY_ID, tags: [] });
    fakeDb.seedConversation({ id: "conv_tmpl_missing", companyId: COMPANY_ID, status: "OPEN" });

    await flowExecutor.processMessage("contact_tmpl_missing", "hola", "conv_tmpl_missing", COMPANY_ID); // n_welcome
    const sessionId = fakeDb.findActiveSession("contact_tmpl_missing")!.id;

    await flowExecutor.resumeSession(sessionId); // -> n_ask_type question
    await flowExecutor.processMessage("contact_tmpl_missing", "casa", "conv_tmpl_missing", COMPANY_ID);
    await flowExecutor.resumeSession(sessionId); // -> n_video
    await flowExecutor.resumeSession(sessionId); // -> n_audio
    await flowExecutor.resumeSession(sessionId); // -> n_ask_budget question
    await flowExecutor.processMessage("contact_tmpl_missing", "300000", "conv_tmpl_missing", COMPANY_ID);
    // -> n_deal, n_tag, n_update, n_webhook (all silent/chain), then n_template: no
    // MessageTemplate named "seguimiento_lead" was seeded for this test, so it
    // logs a warning and advances without producing output, straight into n_delay.
    const out = await flowExecutor.resumeSession(sessionId);

    // n_deal's confirmation text rides along (see the main conversation test);
    // the point here is that NOTHING from n_template appears — no crash, no
    // phantom output, it's silently skipped straight into n_delay.
    expect(out).toEqual(["Registramos tu interés."]);
    expect(flowQueueService.scheduleResume).toHaveBeenCalled(); // reached n_delay right after
  });

  it("send_template with a real approved WhatsApp template: hydrates {{1}}/{{2}} positionally from templateVariables and actually sends it", async () => {
    fakeDb.seedMessageTemplate({
      id: "tmpl_seguimiento",
      companyId: COMPANY_ID,
      name: "seguimiento_lead",
      channel: "WHATSAPP",
      components: [{ type: "BODY", text: "Hola, vimos tu interés en {{1}}. ¿Seguimos platicando?" }],
    });
    fakeDb.seedContact({ id: "contact_tmpl_ok", companyId: COMPANY_ID, tags: [] });
    fakeDb.seedConversation({ id: "conv_tmpl_ok", companyId: COMPANY_ID, status: "OPEN" });

    await flowExecutor.processMessage("contact_tmpl_ok", "hola", "conv_tmpl_ok", COMPANY_ID);
    const sessionId = fakeDb.findActiveSession("contact_tmpl_ok")!.id;

    await flowExecutor.resumeSession(sessionId); // -> n_ask_type question
    await flowExecutor.processMessage("contact_tmpl_ok", "apartamento", "conv_tmpl_ok", COMPANY_ID);
    await flowExecutor.resumeSession(sessionId); // -> n_video
    await flowExecutor.resumeSession(sessionId); // -> n_audio
    await flowExecutor.resumeSession(sessionId); // -> n_ask_budget question
    await flowExecutor.processMessage("contact_tmpl_ok", "300000", "conv_tmpl_ok", COMPANY_ID);
    // -> n_deal, n_tag, n_update, n_webhook chain silently, then n_template is now
    // an OUTPUT node: it yields the hydrated text and pauses (no n_delay yet).
    const out = await flowExecutor.resumeSession(sessionId);

    expect(out).toEqual(["Registramos tu interés.", "Hola, vimos tu interés en apartamento. ¿Seguimos platicando?"]);

    // One more resume reaches n_delay, proving the flow continues normally afterward.
    const next = await flowExecutor.resumeSession(sessionId);
    expect(next).toEqual([]);
    expect(flowQueueService.scheduleResume).toHaveBeenCalled();
  });
});

describe("Frontend/backend field-name fixes", () => {
  // `fieldMismatchFlow` (test/fixtures/flows.ts) uses the exact field names
  // the FlowBuilder UI writes (IntegrationNodeProperties.tsx), not the old
  // "canonical" backend names. These assertions prove the handlers now read
  // them correctly instead of silently ignoring what the user configured.

  beforeEach(() => {
    fakeDb.reset();
    fakeDb.seedWorkflow(fieldMismatchFlow);
    fakeDb.seedMessageTemplate({
      id: "tmpl_confirmacion",
      companyId: COMPANY_ID,
      name: "confirmacion_cita",
      channel: "WHATSAPP",
      components: [{ type: "BODY", text: "Tu cita es {{1}}." }],
    });
    fakeDb.seedContact({ id: "contact_mm", companyId: COMPANY_ID, tags: ["should-be-removed"] });
    fakeDb.seedConversation({ id: "conv_mm", companyId: COMPANY_ID, status: "OPEN" });
  });

  it("HTTP_REQUEST honors the UI's `method` (GET → no body sent), `headers`, and `variable` (custom response-storage name)", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => "{}",
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const out = await flowExecutor.processMessage("contact_mm", "mismatch-test", "conv_mm", COMPANY_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe("https://crm.external.test/leads");
    expect(options.method).toBe("GET");
    expect(options.headers).toMatchObject({ "X-Custom-Header": "should-now-be-sent" });
    // GET requests never send a body — the UI's "body" field is correctly
    // ignored here, not because of the old field-name bug, but by HTTP semantics.
    expect(options.body).toBeUndefined();
    expect(out).toContain("Tu cita es mañana 10am."); // n_template ran too, see below

    // The UI's "Guardar Respuesta en Variable" (`node.data.variable`) — the
    // session completed (reached n_end) but the record itself is retained,
    // so its final variables are still inspectable.
    const finished = [...fakeDb.sessions.values()].find((s) => s.contactId === "contact_mm");
    expect(finished.variables.api_response).toBe(JSON.stringify({ ok: true }));
  });

  it('TAG_CONTACT honors `action: "remove"` — the tag configured for removal is actually removed', async () => {
    await flowExecutor.processMessage("contact_mm", "mismatch-test", "conv_mm", COMPANY_ID);

    const contact = fakeDb.contacts.get("contact_mm");
    expect(contact.tags).not.toContain("should-be-removed");
  });

  it("SEND_TEMPLATE honors the UI's `templateVariables` (JSON-string array) and hydrates {{1}} positionally", async () => {
    const out = await flowExecutor.processMessage("contact_mm", "mismatch-test", "conv_mm", COMPANY_ID);

    expect(out).toContain("Tu cita es mañana 10am.");
  });
});

describe("create_deal pipelineId/stageId and ai_agent additionalPrompt/waitForUser fixes", () => {
  beforeEach(() => {
    fakeDb.reset();
    fakeDb.seedWorkflow(advancedFieldsFlow);
    fakeDb.seedAIAssistant(mockAIAssistantGemini);
    fakeDb.seedAIConfig(mockAIConfig);
    // Company default pipeline — must NOT be the one the deal ends up on.
    fakeDb.seedPipeline({ id: "pipe_default", companyId: COMPANY_ID, isDefault: true });
    fakeDb.seedStage({ id: "stage_default", pipelineId: "pipe_default", order: 0, name: "Default" });
    // The pipeline/stage explicitly chosen in the node's data.
    fakeDb.seedPipeline({ id: "pipe_custom", companyId: COMPANY_ID, isDefault: false });
    fakeDb.seedStage({ id: "stage_custom_won", pipelineId: "pipe_custom", order: 3, name: "Won" });
    fakeDb.seedContact({ id: "contact_adv", companyId: COMPANY_ID, tags: [] });
    fakeDb.seedConversation({ id: "conv_adv", companyId: COMPANY_ID, status: "OPEN" });
    mockGeminiSendMessage.mockReset();
  });

  it("CREATE_DEAL uses the builder-chosen pipelineId/stageId instead of the company default", async () => {
    mockGeminiSendMessage.mockResolvedValueOnce(geminiTextResult("Listo, gracias."));

    await flowExecutor.processMessage("contact_adv", "advanced-test", "conv_adv", COMPANY_ID);

    expect(fakeDb.deals).toHaveLength(1);
    expect(fakeDb.deals[0]).toMatchObject({ pipelineId: "pipe_custom", stageId: "stage_custom_won" });
  });

  it("AI_AGENT concatenates `additionalPrompt` onto the assistant's base system prompt", async () => {
    mockGeminiSendMessage.mockResolvedValueOnce(geminiTextResult("Listo, gracias."));

    await flowExecutor.processMessage("contact_adv", "advanced-test", "conv_adv", COMPANY_ID);

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining("Responde siempre en una sola frase."),
      }),
    );
  });

  it('AI_AGENT with `waitForUser: false` responds once and advances immediately (ignores TERMINAR entirely)', async () => {
    // Deliberately NOT containing "TERMINAR" — proves advancement isn't
    // coming from the keyword, but from waitForUser being explicitly off.
    mockGeminiSendMessage.mockResolvedValueOnce(geminiTextResult("Listo, gracias."));

    const out = await flowExecutor.processMessage("contact_adv", "advanced-test", "conv_adv", COMPANY_ID);

    // Both the AI's single reply AND n_end's message come back in the same
    // turn — proof the flow didn't pause waiting for a follow-up message.
    expect(out).toEqual(["Listo, gracias.", "done"]);
    expect(fakeDb.findActiveSession("contact_adv")).toBeNull(); // session completed
  });

  it(`AI_AGENT with aiAssistantId "${AI_ASSISTANT_ID}" still resolves the seeded assistant (sanity check for the fixture itself)`, async () => {
    mockGeminiSendMessage.mockResolvedValueOnce(geminiTextResult("Listo, gracias."));
    await flowExecutor.processMessage("contact_adv", "advanced-test", "conv_adv", COMPANY_ID);
    expect(mockGeminiSendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("Builder-output validation fix", () => {
  it("a flow shaped exactly like the visual builder produces it (lowercase node types) now PASSES CreateFlowSchema, normalized to uppercase", () => {
    const result = CreateFlowSchema.safeParse({
      body: {
        name: realEstateLeadFlow.name,
        triggerType: realEstateLeadFlow.triggerType,
        triggerConfig: realEstateLeadFlow.triggerConfig,
        nodes: realEstateLeadFlow.nodes, // lowercase types, exactly as the builder saves them
        edges: realEstateLeadFlow.edges,
      },
    });

    // Before the fix, POSTing what the visual builder actually produces to
    // `POST /flows` was rejected outright — nobody could save a flow with
    // any nodes in it. FlowNodeTypeInput now uppercases before validating.
    expect(result.success).toBe(true);
    if (result.success) {
      const nodes = result.data.body.nodes;
      expect(nodes?.every((n) => n.type === n.type.toUpperCase())).toBe(true);
      expect(nodes?.[0].type).toBe("SEND_MESSAGE");
    }
  });

  it("garbage node types are still correctly rejected (the fix normalizes case, it doesn't loosen validation)", () => {
    const result = CreateFlowSchema.safeParse({
      body: {
        name: "bad flow",
        nodes: [{ id: "n1", type: "not_a_real_node_type", data: {} }],
        edges: [],
      },
    });

    expect(result.success).toBe(false);
  });
});
