import type { HttpRequestConfig } from "../../types/schemas.js";
import { AppError } from "../../utils/errors.js";
import { assertSafeUrl } from "../../utils/ssrf-guard.js";
import { withRetry } from "../../utils/retry.js";

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  url: string;
}

export async function executeHttpRequest(config: HttpRequestConfig): Promise<HttpResult> {
  const parsed = await assertSafeUrl(config.url);
  for (const [key, value] of Object.entries(config.queryParams ?? {})) {
    parsed.searchParams.set(key, String(value));
  }

  const maxAttempts = 2;
  const timeoutMs = config.timeoutMs ?? 10000;

  return withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(parsed.toString(), {
          method: config.method,
          headers: {
            "Content-Type": "application/json",
            ...(config.headers ?? {}),
          },
          body:
            config.method === "GET" || config.method === "DELETE"
              ? undefined
              : config.body !== undefined && config.body !== null
                ? JSON.stringify(config.body)
                : undefined,
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") ?? "";
        const body = contentType.includes("application/json")
          ? await response.json()
          : await response.text();

        const expected = config.expectedStatus ?? [200];
        if (!expected.includes(response.status)) {
          throw new AppError(
            "EXTERNAL_SERVICE_ERROR",
            `HTTP request returned unexpected status ${response.status}`,
            502,
            { status: response.status },
          );
        }

        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          headers[k] = v;
        });

        return { status: response.status, headers, body, url: parsed.toString() };
      } finally {
        clearTimeout(timer);
      }
    },
    { maxAttempts, timeoutMs: timeoutMs + 1000 },
  );
}
