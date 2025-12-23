import { prisma } from "@/config/prisma";

export const generateAIResponse = async (
  companyId: string,
  assistantId: string,
  userMessage: string,
  history: { role: "user" | "model"; parts: string }[] = []
): Promise<string | null> => {
  try {
    // 1. Get Config (API Key)
    const config = await prisma.aIConfig.findUnique({ where: { companyId } });
    if (!config?.geminiKey) {
      console.warn("[AI] No Gemini Key found for company", companyId);
      return null;
    }

    // 2. Get Assistant (System Prompt)
    const assistant = await prisma.aIAssistant.findUnique({
      where: { id: assistantId },
    });
    if (!assistant) {
      console.warn("[AI] Assistant not found", assistantId);
      return null;
    }

    // 3. Call Gemini API
    // Use gemini-2.5-flash as default (free tier)
    let model = assistant.modelName || "gemini-2.5-flash";

    // Normalize and validate model name
    model = model.toLowerCase().trim();

    // Map old 1.5 models to new 2.5
    if (model.includes("1.5") || model === "gemini-pro") {
      model = "gemini-2.5-flash";
      console.log(`[AI] Redirected old model to gemini-2.5-flash`);
    }

    // Map pro models to flash (pro requires payment)
    if (model.includes("pro") && !model.includes("2.5")) {
      model = "gemini-2.5-flash";
      console.log(`[AI] Redirected pro model to gemini-2.5-flash (free tier)`);
    }

    // Ensure we have a valid free-tier model
    const validModels = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-preview-09-2025",
    ];

    if (!validModels.includes(model)) {
      console.warn(`[AI] Unknown model "${model}", using gemini-2.5-flash`);
      model = "gemini-2.5-flash";
    }

    console.log(`[AI] Final model: ${model}`);
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;

    // Construct prompt with system instruction as first user message (or system role if supported, but user is safer for v1beta)
    // Note: Gemini Pro works best with alternating user/model.
    const contents = [
      {
        role: "user",
        parts: [
          {
            text: `System Instruction: ${
              assistant.systemPrompt || "You are a helpful assistant."
            }`,
          },
        ],
      },
      {
        role: "model",
        parts: [{ text: "Understood. I will follow these instructions." }],
      },
      ...history.map((h) => ({ role: h.role, parts: [{ text: h.parts }] })),
      { role: "user", parts: [{ text: userMessage }] },
    ];

    console.log(`[AI] Calling Gemini API...`);
    console.log(`[AI] URL: ${url}`);
    console.log(`[AI] Contents count: ${contents.length}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiKey,
      },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[AI] Gemini API Error:");
      console.error("[AI] Status:", response.status);
      console.error("[AI] Response:", err);
      console.error("[AI] Model used:", model);
      console.error(
        "[AI] API Key (first 10 chars):",
        config.geminiKey?.substring(0, 10)
      );
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (text) {
      console.log(`[AI] ✓ Response generated successfully`);
    } else {
      console.warn(`[AI] No text in response:`, JSON.stringify(data));
    }

    return text || null;
  } catch (error) {
    console.error("[AI] Error generating response:", error);
    return null;
  }
};

export const generateRawAIResponse = async (
  companyId: string,
  systemPrompt: string,
  userMessage: string,
  modelName: string = "gemini-2.5-flash"
): Promise<string | null> => {
  try {
    const config = await prisma.aIConfig.findUnique({ where: { companyId } });
    if (!config?.geminiKey) {
      console.warn("[AI] No Gemini Key found for company", companyId);
      return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent`;
    const contents = [
      {
        role: "user",
        parts: [{ text: `System: ${systemPrompt}\n\nUser: ${userMessage}` }],
      },
    ];

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.geminiKey,
      },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    console.error("[AI] Raw generation error:", error);
    return null;
  }
};
