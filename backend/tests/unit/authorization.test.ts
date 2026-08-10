import { describe, expect, it } from "vitest";
import { assertCanAddStepType, assertCanAddTriggerType } from "../../services/authorization/index.js";
import { AppError } from "../../utils/errors.js";

describe("authorization business rules", () => {
  it("allows owner to add db_write step", () => {
    expect(() => assertCanAddStepType("owner", "db_write")).not.toThrow();
  });

  it("blocks editor from adding notify step", () => {
    expect(() => assertCanAddStepType("editor", "notify")).toThrow(AppError);
  });

  it("blocks editor from adding webhook trigger", () => {
    expect(() => assertCanAddTriggerType("editor", "webhook")).toThrow(AppError);
  });

  it("allows owner to add webhook trigger", () => {
    expect(() => assertCanAddTriggerType("owner", "webhook")).not.toThrow();
  });
});
