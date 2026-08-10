import { describe, expect, it } from "vitest";
import { withRetry } from "../../utils/retry.js";

describe("withRetry", () => {
  it("succeeds on first attempt", async () => {
    const result = await withRetry(async () => "ok", { maxAttempts: 3 });
    expect(result).toBe("ok");
  });

  it("retries then succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("timeout");
        return "ok";
      },
      { maxAttempts: 3, initialDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("throws after max attempts", async () => {
    await expect(
      withRetry(async () => {
        throw new Error("timeout");
      }, { maxAttempts: 2, initialDelayMs: 1 }),
    ).rejects.toThrow("timeout");
  });
});
