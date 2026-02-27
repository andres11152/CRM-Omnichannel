import path from "path";
import { Readable } from "stream";
import { aiConfigRepository } from "@/repositories/AiConfigRepository";
import { aiAssistantRepository } from "@/repositories/AIAssistantRepository";
import { mediaRepository } from "@/repositories/MediaRepository";
import { USE_S3, s3Client, BUCKET_NAME } from "@/config/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { AIHistoryMessage } from "@/types/ai.types";
import { Logger } from "@/utils/logger";
import pdfParse from "pdf-parse";

// 🧠 HELPERS: S3 Support
const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

// 🧠 HELPERS: Text Extraction
const extractTextFromPDF = async (dataBuffer: Buffer): Promise<string> => {
  try {
    const data = await pdfParse(dataBuffer);
    return data.text;
  } catch (error) {
    Logger.error(`[RAG] Error parsing PDF buffer:`, error);
    return "";
  }
};

// 🧠 RAG: Fetch & Process Knowledge Base
const getKnowledgeBaseContext = async (companyId: string): Promise<string> => {
  try {
    // 1. Fetch relevant documents
    const documents = await mediaRepository.findMany({
      where: {
        companyId,
        type: "DOCUMENT",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    if (documents.length === 0) return "";

    let context = "--- START OF KNOWLEDGE BASE ---\n";

    for (const doc of documents) {
      let fileBuffer: Buffer | null = null;
      const ext = path.extname(doc.filename || doc.key || "").toLowerCase();

      try {
        if (USE_S3 && s3Client && doc.key) {
          const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: doc.key,
          });
          const response = await s3Client.send(command);
          if (response.Body) {
            // Safe cast to Readable for Node env
            fileBuffer = await streamToBuffer(response.Body as Readable);
          }
        }

        if (fileBuffer) {
          let content = "";
          if (ext === ".pdf") {
            content = await extractTextFromPDF(fileBuffer);
          } else if (ext === ".txt" || ext === ".md") {
            content = fileBuffer.toString("utf-8");
          }

          if (content) {
            const cleanContent = content.replace(/\s+/g, " ").trim();
            context += `Source: ${doc.originalName}\nContent: ${cleanContent.substring(0, 20000)}...\n\n`;
          }
        }
      } catch (err) {
        Logger.error(
          `[RAG] Failed to process document ${doc.originalName}:`,
          err,
        );
      }
    }

    context += "--- END OF KNOWLEDGE BASE ---\n";
    return context;
  } catch (error) {
    Logger.error("[RAG] Failed to build context:", error);
    return "";
  }
};

export const generateAIResponse = async (
  companyId: string,
  assistantId: string,
  userMessage: string,
  history: AIHistoryMessage[] = [],
): Promise<string | null> => {
  try {
    // 1. Get Config (API Key)
    const config = await aiConfigRepository.findUnique({
      where: { companyId },
    });
    if (!config?.geminiKey) {
      return null; // Silent fail if no key
    }

    // 2. Get Assistant (System Prompt)
    const assistant = await aiAssistantRepository.findUnique({
      where: { id: assistantId },
    });
    if (!assistant) {
      return null;
    }

    // 🔍 RAG INJECTION
    const knowledgeContext = await getKnowledgeBaseContext(companyId);
    let systemInstruction =
      assistant.systemPrompt || "You are a helpful assistant.";

    if (knowledgeContext) {
      systemInstruction += `\n\n${knowledgeContext}\n\nIMPORTANT: Use the Knowledge Base above to answer matching questions. If the answer is found in the Knowledge Base, use it. If not, fallback to general knowledge but mention you are not sure.`;
    }

    // 3. Call Gemini API
    let model = (assistant.modelName || "gemini-2.5-flash")
      .toLowerCase()
      .trim();

    // Model normalization logic
    if (model.includes("1.5") || model === "gemini-pro")
      model = "gemini-2.5-flash";
    if (model.includes("pro") && !model.includes("2.5"))
      model = "gemini-2.5-flash";

    const validModels = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-preview-09-2025",
    ];
    if (!validModels.includes(model)) model = "gemini-2.5-flash";

    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;

    const contents = [
      {
        role: "user",
        parts: [{ text: `System Instruction: ${systemInstruction}` }],
      },
      {
        role: "model", // Pre-fill acknowledgment to enforce system prompt behavior
        parts: [{ text: "Understood." }],
      },
      ...history.map((h) => ({ role: h.role, parts: [{ text: h.parts }] })),
      { role: "user", parts: [{ text: userMessage }] },
    ];

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
      Logger.error(`[AI] Gemini API Error ${response.status}: ${err}`);
      return null;
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    Logger.error("[AI] Error generating response:", error);
    return null;
  }
};

export const generateRawAIResponse = async (
  companyId: string,
  systemPrompt: string,
  userMessage: string,
  modelName: string = "gemini-2.5-flash",
): Promise<string | null> => {
  try {
    const config = await aiConfigRepository.findUnique({
      where: { companyId },
    });
    if (!config?.geminiKey) return null;

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
    Logger.error("[AI] Raw generation error:", error);
    return null;
  }
};
