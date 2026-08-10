import { describe, expect, it } from "vitest";
import { evaluateCondition, resolveBranchAction } from "../../backend/utils/conditional-evaluator.js";

describe("Conditional Evaluator", () => {
  it("evaluates equals operator correctly", () => {
    const source = { category: "urgent" };
    expect(evaluateCondition({ source, path: "category", operator: "equals", expectedValue: "urgent" })).toBe(true);
    expect(evaluateCondition({ source, path: "category", operator: "equals", expectedValue: "normal" })).toBe(false);
  });

  it("evaluates contains operator correctly", () => {
    const source = { text: "This is an urgent ticket!" };
    expect(evaluateCondition({ source, path: "text", operator: "contains", expectedValue: "urgent" })).toBe(true);
    expect(evaluateCondition({ source, path: "text", operator: "contains", expectedValue: "low-priority" })).toBe(false);
  });

  it("evaluates numeric comparisons (gt, lt)", () => {
    const source = { count: 15 };
    expect(evaluateCondition({ source, path: "count", operator: "gt", expectedValue: 10 })).toBe(true);
    expect(evaluateCondition({ source, path: "count", operator: "lt", expectedValue: 5 })).toBe(false);
  });

  it("resolves branch action for skip_next_n", () => {
    const action = { action: "skip_next_n" as const, count: 2 };
    const currentPos = 3;
    const resolved = resolveBranchAction(action, currentPos);
    expect(resolved.skipUntilPosition).toBe(6);
  });
});
