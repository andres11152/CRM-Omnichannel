import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { trace, SpanStatusCode, Span, Attributes } from "@opentelemetry/api";
import { Logger } from "@/utils/logger";

/**
 * [SEARCH] OPENTELEMETRY DISTRIBUTED TRACING
 * Enterprise-grade observability for microservices
 *
 * Simplified version for compatibility
 */

// Configure OTLP exporter (sends to Jaeger/Tempo/etc)
const traceExporter = new OTLPTraceExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    "http://localhost:4318/v1/traces",
});

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  serviceName: "sentry-crm-api",
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy instrumentations
      "@opentelemetry/instrumentation-fs": {
        enabled: false,
      },
      "@opentelemetry/instrumentation-dns": {
        enabled: false,
      },
    }),
  ],
});

/**
 * Start OpenTelemetry SDK
 */
export const startTracing = async (): Promise<void> => {
  try {
    await sdk.start();
    Logger.info("[OpenTelemetry] [SEARCH] Tracing initialized");
    Logger.info(
      `[OpenTelemetry] Exporting to: ${
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318"
      }`,
    );
  } catch (error) {
    Logger.error("[OpenTelemetry] Failed to start:", error);
    // Don't throw - we want the app to work even if tracing fails
  }
};

/**
 * Graceful shutdown
 */
export const stopTracing = async (): Promise<void> => {
  try {
    await sdk.shutdown();
    Logger.info("[OpenTelemetry]  Tracing shut down");
  } catch (error) {
    Logger.error("[OpenTelemetry] Shutdown error:", error);
  }
};

/**
 *  Utility: Create custom span
 */
export const createSpan = (
  name: string,
  fn: (span: Span) => Promise<unknown> | unknown,
) => {
  const tracer = trace.getTracer("sentry-crm-api");
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      if (error instanceof Error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      }
      throw error;
    } finally {
      span.end();
    }
  });
};

/**
 *  Utility: Add attributes to current span
 */
export const addSpanAttributes = (
  attributes: Record<string, string | number | boolean>,
) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
};

/**
 *  Utility: Add event to current span
 */
export const addSpanEvent = (name: string, attributes?: Attributes) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
};

/**
 *  Utility: Get current trace ID
 */
export const getCurrentTraceId = (): string | undefined => {
  const span = trace.getActiveSpan();
  return span?.spanContext().traceId;
};

/**
 *  Utility: Get current span ID
 */
export const getCurrentSpanId = (): string | undefined => {
  const span = trace.getActiveSpan();
  return span?.spanContext().spanId;
};

// Export tracer for advanced usage
export const getTracer = () => trace.getTracer("sentry-crm-api");

// Auto-initialize if not in test environment and tracing is not disabled
if (process.env.NODE_ENV !== "test" && process.env.DISABLE_TRACING !== "true") {
  startTracing();

  // Graceful shutdown on signals
  process.on("SIGTERM", async () => {
    await stopTracing();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    await stopTracing();
    process.exit(0);
  });
}
