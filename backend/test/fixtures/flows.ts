/**
 * MOCK FLOW FIXTURES — Real Estate Lead Qualification bot.
 *
 * Shape mirrors exactly what `frontend/src/components/FlowBuilder/index.tsx`
 * actually produces when a human builds this in the visual editor, NOT the
 * idealized shape from `backend/src/types/flow.types.ts`:
 *   - node.type is lowercase ("send_message", not "SEND_MESSAGE") — the
 *     executor uppercases it at runtime (`FlowExecutor.ts` `.toUpperCase()`),
 *     but `CreateFlowSchema`'s Zod enum only accepts UPPERCASE, so a flow
 *     saved exactly as the builder emits it fails HTTP-level validation
 *     (see FlowExecutor.realWorld.test.ts "builder/validation gap" block).
 *   - there is NO explicit "start"/"START" node. The canvas's START pill is
 *     a purely visual affordance (id "start") that is never written into
 *     `nodes`, only referenced as `edge.source` on the first real edge. The
 *     backend resolves the true entry point via topological-root fallback
 *     (`FlowNavigationService.startNewSession`).
 *   - CONDITION nodes route via `edge.label === "TRUE"/"FALSE"` (simple
 *     mode) because the builder UI has no way to set `sourceHandle` — the
 *     `conditions[]` / advanced multi-branch mode is fully implemented
 *     server-side but reachable only via direct API/DB writes, never via
 *     the visual builder. This fixture exercises BOTH modes.
 */

export const COMPANY_ID = "company_test_realty";

export const AI_ASSISTANT_ID = "asst_lead_qualifier";
export const AI_ASSISTANT_ID_OPENAI = "asst_lead_qualifier_openai";

export const mockAIAssistantGemini = {
  id: AI_ASSISTANT_ID,
  companyId: COMPANY_ID,
  name: "Calificador de Leads",
  systemPrompt:
    "Eres un asesor inmobiliario. El cliente busca {{property_type}} con presupuesto {{budget}}. " +
    "Haz una pregunta de seguimiento y cuando tengas el presupuesto EXACTO confirmado, responde con " +
    '[DATA: {"qualified_budget": <numero>}] seguido de TERMINAR.',
  modelProvider: "GEMINI",
  modelName: "gemini-2.5-flash",
  temperature: 0.7,
  isActive: true,
};

export const mockAIAssistantOpenAI = {
  id: AI_ASSISTANT_ID_OPENAI,
  companyId: COMPANY_ID,
  name: "Calificador de Leads (OpenAI)",
  systemPrompt: "Eres un asesor inmobiliario.",
  modelProvider: "OPENAI",
  modelName: "gpt-3.5-turbo",
  temperature: 0.7,
  isActive: true,
};

export const mockAIConfig = {
  companyId: COMPANY_ID,
  geminiKey: "test-gemini-key",
  openaiKey: "test-openai-key",
  isActive: true,
};

/**
 * The full flow: every one of the 17 backend `FlowNodeType`s appears at
 * least once, plus both CONDITION modes (simple label-based, and advanced
 * conditions[] with sourceHandle). Two live paths through it:
 *   - "casa" + budget > 300000  → n_branch TRUE → ... → n_qualify "high" → assign_agent (queue)
 *   - "apartamento" + budget < 300000 → n_branch FALSE → ... → n_qualify "low" → ai_handoff
 * A third, unreachable-by-design fallback (n_qualify default edge → end)
 * documents what happens when neither advanced condition matches.
 */
export const realEstateLeadFlow = {
  id: "flow_real_estate_lead",
  companyId: COMPANY_ID,
  name: "Calificación de Leads Inmobiliarios",
  isActive: true,
  triggerType: "KEYWORD",
  triggerConfig: { keywords: ["hola", "info propiedades"] },
  nodes: [
    { id: "n_welcome", type: "send_message", position: { x: 0, y: 0 }, data: { message: "¡Hola! Bienvenido a Sentry Realty 🏠. Te ayudo a encontrar tu propiedad ideal." } },
    { id: "n_ask_type", type: "ask_data", position: { x: 0, y: 0 }, data: { variable: "property_type", question: "¿Qué tipo de propiedad buscas? (casa/apartamento)" } },
    { id: "n_branch", type: "condition", position: { x: 0, y: 0 }, data: { conditionVariable: "property_type", conditionOperator: "contains", conditionValue: "casa" } },
    { id: "n_img_house", type: "send_image", position: { x: 0, y: 0 }, data: { mediaUrl: "https://cdn.sentryrealty.test/casa.jpg", message: "Así lucen nuestras casas disponibles" } },
    { id: "n_img_apto", type: "send_image", position: { x: 0, y: 0 }, data: { mediaUrl: "https://cdn.sentryrealty.test/apto.jpg", message: "Así lucen nuestros apartamentos disponibles" } },
    { id: "n_video", type: "send_video", position: { x: 0, y: 0 }, data: { mediaUrl: "https://cdn.sentryrealty.test/tour.mp4", message: "Un recorrido virtual" } },
    { id: "n_audio", type: "send_audio", position: { x: 0, y: 0 }, data: { mediaUrl: "https://cdn.sentryrealty.test/proceso.ogg" } },
    { id: "n_ask_budget", type: "ask_data", position: { x: 0, y: 0 }, data: { variable: "budget", question: "¿Cuál es tu presupuesto aproximado en USD?" } },
    { id: "n_document", type: "send_document", position: { x: 0, y: 0 }, data: { mediaUrl: "https://cdn.sentryrealty.test/catalogo.pdf", filename: "catalogo.pdf" } },
    { id: "n_deal", type: "create_deal", position: { x: 0, y: 0 }, data: { title: "Lead: {{property_type}} - USD {{budget}}", value: "{{budget}}", confirmation: "Registramos tu interés." } },
    { id: "n_tag", type: "tag_contact", position: { x: 0, y: 0 }, data: { tags: "lead-caliente,inmobiliaria" } },
    { id: "n_update", type: "update_contact", position: { x: 0, y: 0 }, data: { name: "{{property_type}} Lead", customFields: '{"leadSource":"whatsapp-bot"}' } },
    { id: "n_webhook", type: "http_request", position: { x: 0, y: 0 }, data: { webhookUrl: "https://crm.external.test/leads", httpMethod: "POST", bodyTemplate: '{"type":"{{property_type}}","budget":"{{budget}}"}', errorNodeId: "n_webhook_error" } },
    { id: "n_webhook_error", type: "send_message", position: { x: 0, y: 0 }, data: { message: "No pudimos sincronizar con nuestro CRM externo, pero seguimos aquí para ayudarte." } },
    { id: "n_template", type: "send_template", position: { x: 0, y: 0 }, data: { templateName: "seguimiento_lead", templateParams: ["{{property_type}}"] } },
    { id: "n_delay", type: "delay", position: { x: 0, y: 0 }, data: { delayValue: "1", delayUnit: "minutes" } },
    { id: "n_ai", type: "ai_agent", position: { x: 0, y: 0 }, data: { aiAssistantId: AI_ASSISTANT_ID } },
    {
      id: "n_qualify",
      type: "condition",
      position: { x: 0, y: 0 },
      data: {
        conditionVariable: "qualified_budget",
        conditions: [
          { operator: "greater_than", value: "300000", targetHandle: "high" },
          { operator: "less_than", value: "300000", targetHandle: "low" },
        ],
      },
    },
    { id: "n_assign_queue", type: "assign_agent", position: { x: 0, y: 0 }, data: { assignmentType: "queue", queueId: "queue_ventas_premium", message: "Un asesor senior te contactará en breve." } },
    { id: "n_handoff", type: "ai_handoff", position: { x: 0, y: 0 }, data: { message: "Te conectamos con un agente para ver opciones dentro de tu presupuesto." } },
    { id: "n_end", type: "end", position: { x: 0, y: 0 }, data: { message: "Gracias por tu interés. ¡Hasta pronto!" } },
  ],
  edges: [
    // Phantom edge from the canvas's visual-only START pill — "start" is
    // NOT a real node in `nodes` above. See file header.
    { id: "e_start", source: "start", target: "n_welcome" },
    { id: "e1", source: "n_welcome", target: "n_ask_type" },
    { id: "e2", source: "n_ask_type", target: "n_branch" },
    { id: "e3", source: "n_branch", target: "n_img_house", label: "TRUE" },
    { id: "e4", source: "n_branch", target: "n_img_apto", label: "FALSE" },
    { id: "e5", source: "n_img_house", target: "n_video" },
    { id: "e6", source: "n_img_apto", target: "n_video" },
    { id: "e7", source: "n_video", target: "n_audio" },
    { id: "e8", source: "n_audio", target: "n_ask_budget" },
    { id: "e9", source: "n_ask_budget", target: "n_document" },
    { id: "e10", source: "n_document", target: "n_deal" },
    { id: "e11", source: "n_deal", target: "n_tag" },
    { id: "e12", source: "n_tag", target: "n_update" },
    { id: "e13", source: "n_update", target: "n_webhook" },
    { id: "e14", source: "n_webhook", target: "n_template" },
    { id: "e14b", source: "n_webhook_error", target: "n_template" },
    { id: "e15", source: "n_template", target: "n_delay" },
    { id: "e16", source: "n_delay", target: "n_ai" },
    { id: "e17", source: "n_ai", target: "n_qualify" },
    { id: "e18", source: "n_qualify", target: "n_assign_queue", sourceHandle: "high" },
    { id: "e19", source: "n_qualify", target: "n_handoff", sourceHandle: "low" },
    { id: "e20", source: "n_qualify", target: "n_end" }, // default/fallback edge (no sourceHandle)
  ],
};

/**
 * Same graph as above, but every node.data uses the field names the FRONTEND
 * properties panels actually write (per `PropertiesPanels/*.tsx`) instead of
 * the "canonical" ones from `backend/src/types/flow.types.ts`. These field
 * names are now BOTH read correctly by the handlers (see
 * HttpRequestNodeHandler / TagContactNodeHandler / SendTemplateNodeHandler) —
 * this fixture is what proves that with a real assertion, not a code-reading
 * claim. See FlowExecutor.realWorld.test.ts "frontend/backend field-name
 * fixes" block.
 */
export const fieldMismatchFlow = {
  id: "flow_field_mismatch_demo",
  companyId: COMPANY_ID,
  name: "Field mismatch regression fixture",
  isActive: true,
  triggerType: "KEYWORD",
  triggerConfig: { keywords: ["mismatch-test"] },
  nodes: [
    {
      id: "n_http",
      type: "http_request",
      position: { x: 0, y: 0 },
      data: {
        webhookUrl: "https://crm.external.test/leads",
        // These are the field names IntegrationNodeProperties.tsx actually writes.
        method: "GET",
        headers: '{"X-Custom-Header":"should-now-be-sent"}',
        body: '{"shouldNotAppear":"GET requests never send a body"}',
        variable: "api_response",
      },
    },
    {
      id: "n_tag",
      type: "tag_contact",
      position: { x: 0, y: 0 },
      data: {
        tags: "should-be-removed",
        action: "remove", // IntegrationNodeProperties.tsx's "Remover Etiqueta" option
      },
    },
    {
      id: "n_template",
      type: "send_template",
      position: { x: 0, y: 0 },
      data: {
        templateName: "confirmacion_cita",
        templateVariables: '["mañana 10am"]', // IntegrationNodeProperties.tsx's actual field (JSON-string array)
      },
    },
    { id: "n_end", type: "end", position: { x: 0, y: 0 }, data: { message: "done" } },
  ],
  edges: [
    { id: "e_start", source: "start", target: "n_http" },
    { id: "e1", source: "n_http", target: "n_tag" },
    { id: "e2", source: "n_tag", target: "n_template" },
    { id: "e3", source: "n_template", target: "n_end" },
  ],
};

/**
 * Covers two more fixes: CREATE_DEAL honoring a builder-chosen
 * `pipelineId`/`stageId` instead of always using the company default, and
 * AI_AGENT honoring `additionalPrompt` (concatenated onto the base system
 * prompt) and an explicit `waitForUser: false` (one-shot: respond once and
 * always advance, instead of looping until the model says "TERMINAR").
 */
export const advancedFieldsFlow = {
  id: "flow_advanced_fields_demo",
  companyId: COMPANY_ID,
  name: "pipelineId / additionalPrompt / waitForUser regression fixture",
  isActive: true,
  triggerType: "KEYWORD",
  triggerConfig: { keywords: ["advanced-test"] },
  nodes: [
    {
      id: "n_deal",
      type: "create_deal",
      position: { x: 0, y: 0 },
      data: { title: "Deal on chosen pipeline", value: "100", pipelineId: "pipe_custom", stageId: "stage_custom_won" },
    },
    {
      id: "n_ai",
      type: "ai_agent",
      position: { x: 0, y: 0 },
      data: { aiAssistantId: AI_ASSISTANT_ID, additionalPrompt: "Responde siempre en una sola frase.", waitForUser: false },
    },
    { id: "n_end", type: "end", position: { x: 0, y: 0 }, data: { message: "done" } },
  ],
  edges: [
    { id: "e_start", source: "start", target: "n_deal" },
    { id: "e1", source: "n_deal", target: "n_ai" },
    { id: "e2", source: "n_ai", target: "n_end" },
  ],
};
