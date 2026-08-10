import { describe, expect, it } from "vitest";
import { evaluateCondition, resolveBranchAction } from "../../utils/conditional-evaluator.js";

describe("conditional-evaluator", () => {
  it("matches contains operator case-insensitively", () => {
    const matched = evaluateCondition({
      source: { output: { text: "This is URGENT" } },
      path: "output.text",
      operator: "contains",
      expectedValue: "urgent",
    });
    expect(matched).toBe(true);
  });

  it("returns false for not_contains", () => {
    const matched = evaluateCondition({
      source: { output: { text: "low priority" } },
      path: "output.text",
      operator: "contains",
      expectedValue: "urgent",
    });
    expect(matched).toBe(false);
  });

  it("resolves skip_to_position branch action", () => {
    const result = resolveBranchAction({ action: "skip_to_position", position: 5 }, 2);
    expect(result.skipUntilPosition).toBe(5);
  });

  it("resolves continue branch action", () => {
    const result = resolveBranchAction({ action: "continue" }, 2);
    expect(result.skipUntilPosition).toBeNull();
  });
});
