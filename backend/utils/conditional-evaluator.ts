import { getNestedValue } from "./template.js";
import type { BranchAction } from "../types/schemas.js";

export type ConditionalOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "gt"
  | "lt"
  | "exists";

export interface ConditionalInput {
  source: Record<string, unknown>;
  path: string;
  operator: ConditionalOperator;
  expectedValue?: unknown;
}

export function evaluateCondition(input: ConditionalInput): boolean {
  const actual = getNestedValue(input.source, input.path);

  switch (input.operator) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "equals":
      return String(actual) === String(input.expectedValue ?? "");
    case "not_equals":
      return String(actual) !== String(input.expectedValue ?? "");
    case "contains":
      return String(actual ?? "")
        .toLowerCase()
        .includes(String(input.expectedValue ?? "").toLowerCase());
    case "not_contains":
      return !String(actual ?? "")
        .toLowerCase()
        .includes(String(input.expectedValue ?? "").toLowerCase());
    case "gt":
      return Number(actual) > Number(input.expectedValue);
    case "lt":
      return Number(actual) < Number(input.expectedValue);
    default:
      return false;
  }
}

/** Convert branch action into engine skip semantics. */
export function resolveBranchAction(
  action: BranchAction,
  currentPosition: number,
): { skipUntilPosition: number | null; failMessage?: string } {
  switch (action.action) {
    case "continue":
      return { skipUntilPosition: null };
    case "skip_next_n":
      return { skipUntilPosition: currentPosition + action.count + 1 };
    case "skip_to_position":
      return { skipUntilPosition: action.position };
    case "fail":
      return { skipUntilPosition: null, failMessage: action.message ?? "Conditional branch evaluated to fail" };
    default:
      return { skipUntilPosition: null };
  }
}
