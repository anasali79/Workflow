import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../../utils/template.js";

describe("resolveTemplate", () => {
  it("resolves trigger payload paths", () => {
    const result = resolveTemplate("Hello {{trigger.payload.message}}", {
      triggerPayload: { message: "world" },
      stepOutputs: new Map(),
    });
    expect(result).toBe("Hello world");
  });

  it("resolves step output paths", () => {
    const outputs = new Map<number, Record<string, unknown>>();
    outputs.set(0, { text: "urgent incident" });
    const result = resolveTemplate("Result: {{step_0.text}}", {
      triggerPayload: {},
      stepOutputs: outputs,
    });
    expect(result).toBe("Result: urgent incident");
  });
});
