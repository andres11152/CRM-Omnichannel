import { GoogleGenAI, Content } from "@google/genai";
import { Message, SenderType, Document } from "@/types";

// Access the API key using import.meta.env for client-side code (e.g., in a Vite project)
const apiKey = import.meta.env.VITE_API_KEY;

// Initialize AI only if API key exists (prevents browser crashes)
const getAI = () => {
  if (!apiKey) {
    // console.warn("⚠️ Gemini API Key not configured - AI features disabled");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateBotResponse = async (
  history: Message[],
  systemPrompt: string,
  modelName: string = "gemini-1.5-flash",
  knowledgeBase: Document[] = []
): Promise<string> => {
  try {
    const ai = getAI();
    if (!ai) {
      // No API key configured, return empty response
      return "";
    }

    let ragContext = "";
    if (knowledgeBase.length > 0) {
      ragContext = `
      \n\n=== BASE DE CONOCIMIENTO (MATERIAL DE REFERENCIA) ===
      ${knowledgeBase
        .map(
          (doc) =>
            `--- DOC: ${doc.filename} ---\n${doc.content}\n--- FIN DOC ---`
        )
        .join("\n")}
      \n=== FIN BASE DE CONOCIMIENTO ===\n
      `;
    }

    const formattedHistory: Content[] = history.map((msg) => ({
      role: msg.senderType === SenderType.USER ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    const finalSystemInstruction = `${systemPrompt}${ragContext}`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: formattedHistory,
      config: {
        systemInstruction: finalSystemInstruction,
        temperature: 0.5,
      },
    });

    if (response.text) {
      return response.text;
    }
    return "No se pudo generar una respuesta.";
  } catch (error: any) {
    // Suppress API key errors to avoid console spam
    if (error.message?.includes("API key not valid") || error.status === 400) {
      // Silent fail for missing/invalid API key
      return "";
    }
    console.error("Gemini API Error:", error);
    return "⚠️ Error del Servicio IA: No se pudo procesar la solicitud.";
  }
};

export const analyzeSentiment = async (text: string): Promise<string> => {
  try {
    const ai = getAI();
    if (!ai) {
      // No API key configured, return neutral sentiment
      return "Neutral";
    }

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Analiza el sentimiento de este mensaje y responde SOLO con una palabra: Positivo, Negativo o Neutral.\n\n${text}`,
            },
          ],
        },
      ],
    });

    const sentiment = response.text?.trim();

    if (
      sentiment === "Positive" ||
      sentiment === "Neutral" ||
      sentiment === "Negative"
    ) {
      return sentiment;
    }
    return "Neutral";
  } catch (e: any) {
    // Suppress API key errors to avoid console spam
    if (e.message?.includes("API key not valid") || e.status === 400) {
      console.warn(
        "Gemini API Key missing or invalid. Sentiment analysis skipped."
      );
      return "Neutral";
    }
    console.error("Sentiment Analysis Error:", e);
    return "Neutral";
  }
};
