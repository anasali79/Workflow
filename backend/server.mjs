/**
 * Local Development Action Server
 *
 * Runs on port 1337 to simulate Nhost Functions locally.
 * This allows Hasura Actions to call localhost:1337/v1/functions/<handler>
 * during local development.
 *
 * Start with: node backend/server.mjs
 * (After building backend: npm run build -w @workflow/backend)
 *
 * Routes:
 *   POST /v1/functions/trigger-workflow-run
 *   POST /v1/functions/approve-step
 *   POST /v1/functions/webhook-trigger
 *   POST /v1/functions/scheduled-trigger
 *   POST /v1/functions/db-event-trigger
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from root
const rootEnvPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(rootEnvPath)) {
  const envContent = fs.readFileSync(rootEnvPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
  console.log("✅ Loaded .env from root");
}

const PORT = 1337;

// Handler map: URL path suffix → compiled handler module path
const HANDLERS = {
  "/v1/functions/trigger-workflow-run": "./functions/dist/functions/trigger-workflow-run/index.js",
  "/v1/functions/approve-step": "./functions/dist/functions/approve-step/index.js",
  "/v1/functions/webhook-trigger": "./functions/dist/functions/webhook-trigger/index.js",
  "/v1/functions/scheduled-trigger": "./functions/dist/functions/scheduled-trigger/index.js",
  "/v1/functions/db-event-trigger": "./functions/dist/functions/db-event-trigger/index.js",
};

const server = http.createServer(async (nodeReq, nodeRes) => {
  const url = nodeReq.url || "/";
  const method = nodeReq.method || "GET";

  console.log(`[${new Date().toISOString()}] ${method} ${url}`);

  // CORS headers
  nodeRes.setHeader("Access-Control-Allow-Origin", "*");
  nodeRes.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  nodeRes.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-internal-secret, x-webhook-secret, x-scheduled-secret");

  if (method === "OPTIONS") {
    nodeRes.writeHead(204);
    nodeRes.end();
    return;
  }

  // Find matching handler
  const handlerRelPath = HANDLERS[url];
  if (!handlerRelPath) {
    nodeRes.writeHead(404, { "Content-Type": "application/json" });
    nodeRes.end(JSON.stringify({ error: "Not found", path: url }));
    return;
  }

  const handlerAbsPath = path.resolve(__dirname, handlerRelPath);

  try {
    // Read raw body
    const bodyChunks = [];
    for await (const chunk of nodeReq) {
      bodyChunks.push(chunk);
    }
    const rawBody = Buffer.concat(bodyChunks).toString("utf8");

    // Build a Fetch API-compatible Request object
    const headers = new Headers();
    for (const [k, v] of Object.entries(nodeReq.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    headers.set("host", `localhost:${PORT}`);

    const request = new Request(`http://localhost:${PORT}${url}`, {
      method,
      headers,
      body: rawBody || null,
    });

    // Dynamically import the compiled handler
    const mod = await import(`${handlerAbsPath}?t=${Date.now()}`).catch(() =>
      import(handlerAbsPath)
    );

    const handler = mod.default;
    if (typeof handler !== "function") {
      throw new Error(`Handler at ${handlerAbsPath} has no default export function`);
    }

    // Call the handler
    const response = await handler(request);

    // Write response
    nodeRes.writeHead(response.status, {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
    });
    const text = await response.text();
    nodeRes.end(text);
  } catch (err) {
    console.error(`[ERROR] ${url}:`, err);
    nodeRes.writeHead(500, { "Content-Type": "application/json" });
    nodeRes.end(JSON.stringify({ message: err instanceof Error ? err.message : "Internal server error" }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Local Action Server running at http://localhost:${PORT}`);
  console.log("   Available endpoints:");
  for (const route of Object.keys(HANDLERS)) {
    console.log(`   POST http://localhost:${PORT}${route}`);
  }
  console.log("");
});

server.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});
