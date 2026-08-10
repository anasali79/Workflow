import { describe, expect, it } from "vitest";
import { assertSafeUrl } from "../../backend/utils/ssrf-guard.js";
import { AppError } from "../../backend/utils/errors.js";

describe("SSRF Guard", () => {
  it("allows valid public HTTPS and HTTP URLs", async () => {
    const url1 = await assertSafeUrl("https://api.github.com/zen");
    expect(url1.hostname).toBe("api.github.com");

    const url2 = await assertSafeUrl("https://jsonplaceholder.typicode.com/posts");
    expect(url2.hostname).toBe("jsonplaceholder.typicode.com");
  });

  it("blocks localhost, 127.0.0.1, and private IPs", async () => {
    await expect(assertSafeUrl("http://localhost:3000/api")).rejects.toThrow(AppError);
    await expect(assertSafeUrl("http://127.0.0.1/status")).rejects.toThrow(AppError);
    await expect(assertSafeUrl("http://192.168.1.1/admin")).rejects.toThrow(AppError);
    await expect(assertSafeUrl("http://10.0.0.1/internal")).rejects.toThrow(AppError);
  });

  it("blocks AWS metadata endpoint 169.254.169.254", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(AppError);
  });

  it("rejects non-HTTP protocols", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(AppError);
    await expect(assertSafeUrl("gopher://localhost:70")).rejects.toThrow(AppError);
  });
});
