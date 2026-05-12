import CircuitBreaker from "opossum";
import { Logger } from "@/utils/logger";

interface AIRequestInput {
  provider: "openai" | "gemini";
  prompt: string;
  context?: Record<string, unknown>;
  companyId: string;
}

interface AIResponse {
  content: string;
  success: boolean;
  isFallback?: boolean;
}

/**
 * 🛡️ [SRE] AI INTEGRATION WRAPPER (CIRCUIT BREAKER)
 * Protects against failure cascades when OpenAI or Gemini APIs are down.
 * Prevents Thread Pool saturation and automatically aborts BullMQ retries.
 */
class AIIntegrationWrapper {
  private openaiBreaker: CircuitBreaker<[AIRequestInput], AIResponse>;
  private geminiBreaker: CircuitBreaker<[AIRequestInput], AIResponse>;

  constructor() {
    const breakerOptions: CircuitBreaker.Options = {
        timeout: 10000,                  // Fail if duration > 10 seconds
        errorThresholdPercentage: 50,    // Opens if 50% failed
        resetTimeout: 30000,             // After 30s open, try test request (Half-Open)
        volumeThreshold: 10,             // Minimum 10 calls to start calculating the 50%
        name: "AI-External-Integrations"
    };

    // Initialize separate Circuit Breakers per provider
    this.openaiBreaker = new CircuitBreaker<[AIRequestInput], AIResponse>(this.executeOpenAI, { ...breakerOptions, name: "OpenAI-Breaker" });
    this.geminiBreaker = new CircuitBreaker<[AIRequestInput], AIResponse>(this.executeGemini, { ...breakerOptions, name: "Gemini-Breaker" });

    this.setupMonitoring(this.openaiBreaker);
    this.setupMonitoring(this.geminiBreaker);
  }

  /**
   * Passive monitor for SRE Logs
   */
  private setupMonitoring(breaker: CircuitBreaker<[AIRequestInput], AIResponse>) {
    breaker.on("open", () => {
      Logger.error(`[🚨 CIRCUIT OPEN] ${breaker.name} is unstable. All calls will route to Fallback immediately.`);
    });
    
    breaker.on("halfOpen", () => {
      Logger.warn(`[⚠️ CIRCUIT HALF-OPEN] ${breaker.name} testing availability...`);
    });
 
    breaker.on("close", () => {
      Logger.info(`[✅ CIRCUIT CLOSED] ${breaker.name} recovered and operating normally.`);
    });
 
    breaker.on("fallback", (result: unknown) => {
       Logger.warn(`[Fallback Executed] ${breaker.name} prevented network retry:`, result as Record<string, unknown>);
    });
  }

  /**
   * Main entry point for AI execution
   */
  public async generateAILine(input: AIRequestInput): Promise<AIResponse> {
    try {
      if (input.provider === "openai") {
        return await this.openaiBreaker.fire(input);
      } else {
        return await this.geminiBreaker.fire(input);
      }
    } catch (error: unknown) {
       // This catch captures catastrophic rejections if fallback fails, 
       // but Opossum will pipe everything to the configured fallback() method.
       Logger.error("[AIWrapper] Catastrophic failure", error);
       return this.safefallback(input);
    }
  }

  // --- PROVIDER LOGIC (Arrow functions to preserve 'this') ---
 
  private executeOpenAI = async (input: AIRequestInput): Promise<AIResponse> => {
    // OpenAI client would go here
    Logger.debug(`[Network] Calling OpenAI API for ${input.companyId}...`);
    return { content: `Respuesta de OpenAI a: ${input.prompt}`, success: true };
  };
 
  private executeGemini = async (input: AIRequestInput): Promise<AIResponse> => {
     // Gemini client would go here
     Logger.debug(`[Network] Calling Gemini API for ${input.companyId}...`);
     return { content: `Respuesta de Gemini a: ${input.prompt}`, success: true };
  };

  // --- STRICT FALLBACK LOGIC (SRE) ---

  /**
   * Executes IMMEDIATELY when circuit is open (no network wait).
   * Returns "Success: true" to DECEIVE BullMQ and mark as "Completed".
   * This prevents a retry storm that would consume CPU and Redis memory.
   */
  private safefallback(input: AIRequestInput): AIResponse {
      return {
          content: "🤖 *(AI Agent is temporarily out of service due to high demand. A human will take over your case shortly).* ",
          success: true, // ⚠️ CRITICAL: true deceives BullMQ into removing the Job.
          isFallback: true
      }
  }

  public getOpenAIBreaker() {
      // Required to bind Opossum fallback
      return this.openaiBreaker;
  }
}

// Opossum config: link fallback *directly* to breaker.
const aiWrapperRef = new AIIntegrationWrapper();

// Force Opossum to use our instance fallback function.
aiWrapperRef["openaiBreaker"].fallback((input: AIRequestInput, error: Error) => {
   Logger.warn(`[OpenAI Fallback Triggered] Cause: ${error?.message || "Open Circuit"}`);
   return { 
       content: "🤖 *(Our AI servers are saturated at this moment. Please wait while we connect a human agent).* ", 
       success: true, 
       isFallback: true 
   };
});

aiWrapperRef["geminiBreaker"].fallback((input: AIRequestInput, error: Error) => {
    Logger.warn(`[Gemini Fallback Triggered] Cause: ${error?.message || "Open Circuit"}`);
    return { 
        content: "🤖 *(Our AI servers are saturated at this moment. Please wait while we connect a human agent).* ", 
        success: true, 
        isFallback: true 
    };
});

export const aiIntegrationWrapper = aiWrapperRef;
