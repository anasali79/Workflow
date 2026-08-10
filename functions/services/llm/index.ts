import type { LlmCallConfig } from "../../types/schemas.js";
import { AppError } from "../../utils/errors.js";
import { withRetry } from "../../utils/retry.js";
import { logger } from "../../utils/logger.js";

export interface LlmResult {
  text: string;
  model: string;
  provider: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

type LlmProvider = "groq" | "openrouter" | "gemini";

function getProvider(): LlmProvider {
  const p = (process.env.LLM_PROVIDER ?? "groq").toLowerCase();
  if (p === "openrouter" || p === "gemini" || p === "groq") return p;
  return "groq";
}

async function callGroq(config: LlmCallConfig): Promise<LlmResult> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "development") {
      return {
        text: "[DEV MOCK] Classification: urgent — simulated LLM response for local development.",
        model: config.model ?? process.env.LLM_MODEL ?? "mock",
        provider: "groq-mock",
      };
    }
    throw new AppError("INTERNAL_ERROR", "LLM_API_KEY is not configured", 500);
  }

  const model = config.model ?? process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
  const maxRetries = Number(process.env.LLM_MAX_RETRIES ?? 2);

  return withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: config.temperature ?? 0.7,
            max_tokens: config.maxTokens ?? 1024,
            messages: [
              ...(config.systemPrompt ? [{ role: "system", content: config.systemPrompt }] : []),
              { role: "user", content: config.userPrompt },
            ],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Groq API error: HTTP ${response.status}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const text = data.choices?.[0]?.message?.content ?? "";
        return {
          text,
          model,
          provider: "groq",
          usage: {
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
          },
        };
      } finally {
        clearTimeout(timer);
      }
    },
    { maxAttempts: maxRetries, timeoutMs },
  );
}

async function callOpenRouter(config: LlmCallConfig): Promise<LlmResult> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new AppError("INTERNAL_ERROR", "LLM_API_KEY is not configured", 500);
  const model = config.model ?? process.env.LLM_MODEL ?? "openai/gpt-4o-mini";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(config.systemPrompt ? [{ role: "system", content: config.systemPrompt }] : []),
        { role: "user", content: config.userPrompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter API error: HTTP ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return { text: data.choices?.[0]?.message?.content ?? "", model, provider: "openrouter" };
}

async function callGemini(config: LlmCallConfig): Promise<LlmResult> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new AppError("INTERNAL_ERROR", "LLM_API_KEY is not configured", 500);
  const model = config.model ?? process.env.LLM_MODEL ?? "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: config.userPrompt }] }],
      systemInstruction: config.systemPrompt ? { parts: [{ text: config.systemPrompt }] } : undefined,
    }),
  });

  if (!response.ok) throw new Error(`Gemini API error: HTTP ${response.status}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    model,
    provider: "gemini",
  };
}

export async function executeLlmCall(config: LlmCallConfig): Promise<LlmResult> {
  const provider = getProvider();
  logger.info("LLM call starting", { action: "llm_call", success: true });

  switch (provider) {
    case "openrouter":
      return callOpenRouter(config);
    case "gemini":
      return callGemini(config);
    case "groq":
    default:
      return callGroq(config);
  }
}
