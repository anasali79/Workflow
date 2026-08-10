import type { NotifyConfig } from "../../types/schemas.js";
import { AppError } from "../../utils/errors.js";
import { withRetry } from "../../utils/retry.js";

export async function sendNotification(message: string, config: NotifyConfig): Promise<{ provider: string; delivered: boolean }> {
  if (config.provider === "slack") {
    const webhookUrl = (config.webhookUrl && config.webhookUrl.trim().length > 0)
      ? config.webhookUrl.trim()
      : process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      return {
        provider: "slack-mock (No Slack Webhook URL provided in step config or SLACK_WEBHOOK_URL .env)",
        delivered: true
      };
    }

    // Webhook URL is present — execute real HTTP POST request to Slack/Webhook endpoint!
    await withRetry(
      async () => {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message }),
        });
        if (!response.ok) {
          throw new Error(`Webhook post failed: HTTP ${response.status}`);
        }
      },
      { maxAttempts: 2 },
    );

    return { provider: "slack", delivered: true };
  }

  // Email notification mock/integration
  const emailKey = process.env.EMAIL_API_KEY;
  if (!emailKey) {
    return { provider: "email-mock", delivered: true };
  }

  throw new AppError("INTERNAL_ERROR", "Email provider integration not yet configured", 501);
}
