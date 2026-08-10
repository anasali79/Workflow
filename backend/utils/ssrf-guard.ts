import { lookup } from "node:dns/promises";
import { AppError } from "./errors.js";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata.google",
]);

function isPrivateIp(ip: string): boolean {
  if (ip === "::1") return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid URL", 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError("VALIDATION_ERROR", "Only HTTP(S) URLs are allowed", 400);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".internal")) {
    throw new AppError("FORBIDDEN", "Target host is not allowed", 403);
  }

  // Block obvious IP literals in private ranges
  if (isPrivateIp(hostname)) {
    throw new AppError("FORBIDDEN", "Private network targets are blocked", 403);
  }

  // Resolve DNS and reject if any A/AAAA record is private (basic SSRF mitigation)
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        throw new AppError("FORBIDDEN", "Resolved address is in a blocked range", 403);
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION_ERROR", "Unable to resolve URL hostname", 400);
  }

  return parsed;
}
