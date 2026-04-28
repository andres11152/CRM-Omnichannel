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
 * Protege contra cascadas de fallos cuando las APIs de OpenAI o Gemini están caídas.
 * Evita la saturación del Thread Pool y aborta automáticamente reintentos de BullMQ.
 */
class AIIntegrationWrapper {
  private openaiBreaker: CircuitBreaker<[AIRequestInput], AIResponse>;
  private geminiBreaker: CircuitBreaker<[AIRequestInput], AIResponse>;

  constructor() {
    const breakerOptions: CircuitBreaker.Options = {
        timeout: 10000,                  // Fallar si dura > 10 segundos
        errorThresholdPercentage: 50,    // Se abre si el 50% falló
        resetTimeout: 30000,             // Después de 30s abierto, intentar petición de prueba (Half-Open)
        volumeThreshold: 10,             // Mínimo de 10 llamadas para empezar a calcular el 50%
        name: "AI-External-Integrations"
    };

    // Inicializamos Circuit Breakers separados por proveedor
    this.openaiBreaker = new CircuitBreaker<[AIRequestInput], AIResponse>(this.executeOpenAI, { ...breakerOptions, name: "OpenAI-Breaker" });
    this.geminiBreaker = new CircuitBreaker<[AIRequestInput], AIResponse>(this.executeGemini, { ...breakerOptions, name: "Gemini-Breaker" });

    this.setupMonitoring(this.openaiBreaker);
    this.setupMonitoring(this.geminiBreaker);
  }

  /**
   * Monitor pasivo para Logs SRE
   */
  private setupMonitoring(breaker: CircuitBreaker<[AIRequestInput], AIResponse>) {
    breaker.on("open", () => {
      Logger.error(`[🚨 CIRCUIT OPEN] ${breaker.name} está inestable. Todas las llamadas se enrutarán a Fallback inmediatamente.`);
    });
    
    breaker.on("halfOpen", () => {
      Logger.warn(`[⚠️ CIRCUIT HALF-OPEN] ${breaker.name} testeando disponibilidad...`);
    });
 
    breaker.on("close", () => {
      Logger.info(`[✅ CIRCUIT CLOSED] ${breaker.name} recuperado y operando normalmente.`);
    });
 
    breaker.on("fallback", (result: unknown) => {
       Logger.warn(`[Fallback Ejecutado] ${breaker.name} evitó reintento de red:`, result as Record<string, unknown>);
    });
  }

  /**
   * Punto de entrada principal para ejecutar la IA
   */
  public async generateAILine(input: AIRequestInput): Promise<AIResponse> {
    try {
      if (input.provider === "openai") {
        return await this.openaiBreaker.fire(input);
      } else {
        return await this.geminiBreaker.fire(input);
      }
    } catch (error: unknown) {
       // Este Catch captura rechazos catastróficos si el fallback falla, 
       // pero Opossum canalizará todo al método fallback() configurado.
       Logger.error("[AIWrapper] Catastrophic failure", error);
       return this.safefallback(input);
    }
  }

  // --- LÓGICA DE PROVEEDORES (Arrow functions to preserve 'this') ---
 
  private executeOpenAI = async (input: AIRequestInput): Promise<AIResponse> => {
    // Aquí iría tu: await openaiApi.createCompletion(...)
    Logger.debug(`[Network] Llamando API de OpenAI para ${input.companyId}...`);
    return { content: `Respuesta de OpenAI a: ${input.prompt}`, success: true };
  };
 
  private executeGemini = async (input: AIRequestInput): Promise<AIResponse> => {
     // Aquí iría el cliente de Gemini: await genAI.getGenerativeModel(...)
     Logger.debug(`[Network] Llamando API de Gemini para ${input.companyId}...`);
     return { content: `Respuesta de Gemini a: ${input.prompt}`, success: true };
  };

  // --- LÓGICA ESTRICTA DE FALLBACK (SRE) ---

  /**
   * Se ejecuta INMEDIATAMENTE cuando el circuito está abierto (sin esperar red).
   * Devuelve "Success: true" para ENGAÑAR a BullMQ y que lo marque como "Completed".
   * Esto evita un infierno de reintentos que devoraría la CPU y memoria Redis.
   */
  private safefallback(input: AIRequestInput): AIResponse {
      return {
          content: "🤖 *(El Agente de IA está temporalmente fuera de servicio por alta demanda. Un humano tomará tu caso en breve).* ",
          success: true, // ⚠️ CRÍTICO: true engaña a BullMQ para que elimine el Job.
          isFallback: true
      }
  }

  public getOpenAIBreaker() {
      // Necesario para bindear el fallback de opossum
      return this.openaiBreaker;
  }
}

// Configuración requerida de Opossum: enlazar el fallback *directamente* al breaker.
const aiWrapperRef = new AIIntegrationWrapper();

// Forzamos que Opossum use la función fallback de nuestra instancia.
aiWrapperRef["openaiBreaker"].fallback((input: AIRequestInput, error: Error) => {
   Logger.warn(`[OpenAI Fallback Triggered] Causa: ${error?.message || "Circuito Abierto"}`);
   return { 
       content: "🤖 *(Nuestros servidores de IA están saturados en este instante. Por favor, aguarda mientras conectamos a un agente humano).* ", 
       success: true, 
       isFallback: true 
   };
});

aiWrapperRef["geminiBreaker"].fallback((input: AIRequestInput, error: Error) => {
    Logger.warn(`[Gemini Fallback Triggered] Causa: ${error?.message || "Circuito Abierto"}`);
    return { 
        content: "🤖 *(Nuestros servidores de IA están saturados en este instante. Por favor, aguarda mientras conectamos a un agente humano).* ", 
        success: true, 
        isFallback: true 
    };
});

export const aiIntegrationWrapper = aiWrapperRef;
