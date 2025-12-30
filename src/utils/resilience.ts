import { Logger } from "./logger";

/**
 * 🛡️ CIRCUIT BREAKER PATTERN
 *
 * Prevents cascading failures by temporarily blocking requests to a failing service.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests are blocked immediately
 * - HALF_OPEN: Testing if service has recovered
 *
 * @example
 * const breaker = new CircuitBreaker({ threshold: 5, timeout: 60000 });
 * await breaker.execute(() => externalApiCall());
 */

interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  threshold?: number;
  /** Time in ms before attempting to close circuit */
  timeout?: number;
  /** Name for logging */
  name?: string;
}

enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  private readonly threshold: number;
  private readonly timeout: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.threshold || 5;
    this.timeout = options.timeout || 60000; // 1 minute default
    this.name = options.name || "CircuitBreaker";
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error(
          `[${this.name}] Circuit breaker is OPEN. Service temporarily unavailable.`
        );
      }
      // Try to recover
      this.state = CircuitState.HALF_OPEN;
      Logger.info(`[${this.name}] Circuit breaker entering HALF_OPEN state`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 2) {
        // Require 2 successes to fully close
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        Logger.info(`[${this.name}] ✅ Circuit breaker CLOSED (recovered)`);
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.successCount = 0;

    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
      Logger.error(
        `[${this.name}] 🚨 Circuit breaker OPEN after ${
          this.failureCount
        } failures. Will retry at ${new Date(this.nextAttempt).toISOString()}`
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    Logger.info(`[${this.name}] Circuit breaker manually reset`);
  }
}

/**
 * 🛡️ RETRY WITH EXPONENTIAL BACKOFF
 *
 * Automatically retries failed operations with increasing delays.
 *
 * @example
 * await retryWithBackoff(() => unstableApiCall(), { maxRetries: 3 });
 */
interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(
        initialDelay * Math.pow(factor, attempt),
        maxDelay
      );

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      Logger.warn(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms. Error: ${
          lastError.message
        }`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
