import { describe, expect, it } from "vitest";
import { assertValidUuid, extractUserId } from "../../backend/functions/utils/http.js";
import { AppError } from "../../backend/utils/errors.js";

describe("Function HTTP Utils", () => {
  it("extracts user ID from x-hasura-user-id header", () => {
    const sessionVars = { "x-hasura-user-id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };
    expect(extractUserId(sessionVars)).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
  });

  it("throws FORBIDDEN when user ID session variable is missing", () => {
    expect(() => extractUserId({})).toThrow(AppError);
  });

  it("validates valid UUIDs", () => {
    const valid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    expect(assertValidUuid(valid, "testId")).toBe(valid);
  });

  it("rejects invalid UUIDs", () => {
    expect(() => assertValidUuid("invalid-uuid-123", "testId")).toThrow(AppError);
  });
});
