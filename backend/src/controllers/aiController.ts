import { Response, NextFunction } from "express";
import { catchAsync } from "@/utils/catchAsync";
import { AuthenticatedRequest } from "@/types/types";
import { AppError } from "@/utils/AppError";
import { aiCrudService } from "@/services/aiCrudService";

/**
 * AI CONTROLLER
 *
 * HTTP orchestrator for AI Config and AI Assistants.
 * All data access delegated to aiCrudService (SRP).
 */

// --- AI CONFIG (API KEYS) ---

export const getAIConfig = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    const config = await aiCrudService.getConfig(companyId!);

    res.status(200).json(config || {});
  },
);

export const updateAIConfig = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { openaiKey, geminiKey } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID missing", 400));

    await aiCrudService.upsertConfig(companyId, { openaiKey, geminiKey });

    res.status(200).json({ status: "success", message: "AI Config updated" });
  },
);

// --- AI ASSISTANTS (PERSONAS) ---

export const getAssistants = catchAsync(
  async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;

    const assistants = await aiCrudService.findAllAssistants(companyId!);

    res.status(200).json(assistants);
  },
);

export const createAssistant = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID missing", 400));

    const assistant = await aiCrudService.createAssistant(
      companyId,
      req.body as Parameters<typeof aiCrudService.createAssistant>[1],
    );

    res.status(201).json(assistant);
  },
);

export const updateAssistant = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID missing", 400));

    const assistant = await aiCrudService.updateAssistant(
      id,
      companyId,
      req.body,
    );

    res.status(200).json(assistant);
  },
);

export const deleteAssistant = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID missing", 400));

    await aiCrudService.deleteAssistant(id, companyId);

    res.status(204).send();
  },
);

export const testAI = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { assistantId, message } = req.body;
    const companyId = req.companyId || req.user?.companyId;

    if (!companyId) return next(new AppError("Company ID missing", 400));

    const { generateAIResponse } = await import("@/services/aiResponseService");

    const response = await generateAIResponse(
      companyId,
      assistantId,
      message || "Hello",
      [],
    );

    if (!response) {
      return res.status(500).json({
        status: "error",
        message: "AI generation failed. Check server logs.",
      });
    }

    res.status(200).json({ status: "success", response });
  },
);

export const copilotAction = catchAsync(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { action, text, context } = req.body;
    const companyId = req.companyId || req.user?.companyId;
    if (!companyId) return next(new AppError("Company ID missing", 400));

    const { generateRawAIResponse } =
      await import("@/services/aiResponseService");

    let systemPrompt = "";
    let userMessage = "";

    if (action === "summarize") {
      systemPrompt =
        "Eres un experto en CRM. Resume la siguiente transcripción de chat en bullet points breves. Identifica el motivo del contacto, la resolución y tareas pendientes si las hay. Idioma: Español.";
      userMessage = context || text;
    } else if (action === "formal") {
      systemPrompt =
        "Actúa como un editor profesional. Reescribe el siguiente mensaje para que sea formal, amable y corporativo, listo para enviar a un cliente. No cambies el sentido. Solo devuelve el texto reescrito. Idioma: Español.";
      userMessage = text;
    } else if (action === "suggest") {
      systemPrompt =
        "Eres un agente de soporte de clase mundial. Basado en el contexto de la conversación, sugiere la mejor respuesta siguiente. Que sea empática, resolutiva y breve. Solo el texto de respuesta. Idioma: Español.";
      userMessage = context;
    } else if (action === "generate_template") {
      systemPrompt = `Actúa como un Diseñador UI/UX y Desarrollador Email Frontend de CLASE MUNDIAL (Elite Level).
        
        TU OBJETIVO: Generar HTML para emails que sea VISUALMENTE IMPACTANTE, RESPONSIVE y COMPATIBLE con todos los clientes (Outlook, Gmail, Apple).
        
        REGLAS DE ORO (STRICT):
        1.  **LAYOUT FLUIDO & RESPONSIVE**:
            - Usa siempre un contenedor principal con \`max-width: 600px\` centrado (\`margin: 0 auto\`).
            - Usa \`width: 100%\` para tablas internas.
            - INCLUYE este CSS en el header: 
              \`<style>
                @media only screen and (max-width: 600px) {
                  .main-container { width: 100% !important; }
                  .fluid-img { width: 100% !important; height: auto !important; }
                  .mobile-stack { display: block !important; width: 100% !important; }
                  .mobile-padding { padding: 10px !important; }
                  .mobile-text { font-size: 16px !important; line-height: 1.5 !important; }
                }
              </style>\`
        2.  **ESTRUCTURA DE TABLAS (ROCK SOLID)**:
            - Usa \`<table>\` para todo el layout estructural. NUNCA uses divs para columnas.
            - Añade \`role="presentation"\`, \`cellspacing="0"\`, \`cellpadding="0"\`, \`border="0"\` a todas las tablas.
        3.  **ESTILOS VISUALES (ELITE)**:
            - Usa fuentes modernas sans-serif (Inter, Helvetica, Arial).
            - Espaciado generoso (whitespace) para dar sensación de lujo.
            - Botones tipo "Call to Action" grandes y táctiles (min-height 44px).
            - Colores contrastantes y jerarquía visual clara (H1 > H2 > P).
        4.  **IMÁGENES**:
            - Siempre añade \`display: block;\`, \`border: 0;\`, y \`width: 100%;\` (o max-width) a las imágenes.
        
        OUTPUT: Solo devuelve el código HTML crudo, empezando por \`<!DOCTYPE html>\`. Sin markdown, sin explicaciones.`;
      userMessage = `CONTEXTO DEL USUARIO: ${text}`;
    } else {
      return next(new AppError("Invalid action", 400));
    }

    const response = await generateRawAIResponse(
      companyId,
      systemPrompt,
      userMessage,
    );

    if (response === null) {
      return res.status(503).json({
        status: "error",
        message:
          "IA no disponible. Verifica que la API Key de Gemini esté configurada en Ajustes.",
      });
    }

    res.status(200).json({ status: "success", response });
  },
);
