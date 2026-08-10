import { logger } from "./logger.js";

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
  /** Return true to retry on this error */
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

const defaultIsRetryable = (error: unknown): boolean => {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("429") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504")
    );
  }
  return false;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxAttempts,
    initialDelayMs = 500,
    maxDelayMs = 8000,
    backoffMultiplier = 2,
    timeoutMs,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = options;

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (timeoutMs) {
        return await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs),
          ),
        ]);
      }
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = attempt < maxAttempts && isRetryable(error);
      logger.warn("Retry attempt failed", {
        action: "retry",
        attempt,
        maxAttempts,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!retryable) break;
      onRetry?.(attempt, error);
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}
