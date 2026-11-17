import { DurableObject } from "cloudflare:workers";
import { getChatReply, validateChatPayload } from "./ai-core.mjs";

const MAX_BODY_BYTES = 64 * 1024;
const WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_REQUESTS_PER_DAY = 25;
const MAX_GLOBAL_REQUESTS_PER_DAY = 300;
const MAX_CLIENTS = 10_000;
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function hashClientAddress(address, apiKey) {
  const secret = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", secret, new TextEncoder().encode(address));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function checkLimit(environment, request) {
  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await hashClientAddress(address, environment.AI_API_KEY);
  const id = environment.USAGE_LIMITER.idFromName("all-ai-requests");
  const response = await environment.USAGE_LIMITER.get(id).fetch("https://limits.internal/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key })
  });
  if (!response.ok) throw new Error("Cloudflare usage limiter unavailable");
  return response.json();
}

async function readLimitedRequestBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        const error = new Error("Request too large");
        error.status = 413;
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function handleChat(request, environment) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, { Allow: "POST" });
  }
  if (!String(request.headers.get("Content-Type") || "").toLowerCase().startsWith("application/json")) {
    return jsonResponse(415, { error: "Content type must be JSON" });
  }
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "Request too large" });
  }

  let payload;
  try {
    payload = validateChatPayload(JSON.parse(await readLimitedRequestBody(request)));
  } catch (error) {
    return jsonResponse(error.status || 400, { error: error.status === 413 ? "Request too large" : "Invalid request" });
  }
  if (!payload) return jsonResponse(400, { error: "Invalid request" });
  if (!environment.AI_API_KEY) return jsonResponse(503, { error: "OpenRouter is not configured" });

  let limit;
  try {
    limit = await checkLimit(environment, request);
  } catch (error) {
    console.error("Cloudflare usage limiter failed:", error.message);
    return jsonResponse(503, { error: "Chat service unavailable" });
  }
  if (!limit.allowed) {
    return jsonResponse(429, { error: "Rate limit exceeded" }, { "Retry-After": String(limit.retryAfter) });
  }

  try {
    const reply = await getChatReply(payload, environment.AI_API_KEY);
    if (!reply) return jsonResponse(503, { error: "OpenRouter is not configured" });
    return jsonResponse(200, { reply });
  } catch (error) {
    console.error("OpenRouter chat request failed:", error.message);
    if (error.name === "TimeoutError" || /timed out|timeout|operation was aborted/i.test(error.message)) {
      return jsonResponse(504, { error: "Chat request timed out" });
    }
    return jsonResponse(502, { error: "Chat service unavailable" });
  }
}

export class UsageLimiter extends DurableObject {
  constructor(ctx, environment) {
    super(ctx, environment);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ai_requests (
        client TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ai_requests_by_client_and_time
        ON ai_requests (client, created_at);
    `);
  }

  async fetch(request) {
    if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid request" });
    }
    if (typeof payload?.key !== "string" || !/^[a-f0-9]{64}$/.test(payload.key)) {
      return jsonResponse(400, { error: "Invalid request" });
    }

    const now = Date.now();
    const result = this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      sql.exec("DELETE FROM ai_requests WHERE created_at <= ?", now - DAY_MS);

      const globalCount = sql.exec(
        "SELECT COUNT(*) AS count FROM ai_requests WHERE client = 'global'"
      ).one().count;
      const globalFirst = sql.exec(
        "SELECT MIN(created_at) AS first FROM ai_requests WHERE client = 'global'"
      ).one().first;
      if (globalCount >= MAX_GLOBAL_REQUESTS_PER_DAY) {
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((globalFirst + DAY_MS - now) / 1000)) };
      }

      const clientCount = sql.exec(
        "SELECT COUNT(*) AS count FROM ai_requests WHERE client = ?",
        payload.key
      ).one().count;
      if (clientCount === 0) {
        const distinctClients = sql.exec(
          "SELECT COUNT(DISTINCT client) AS count FROM ai_requests WHERE client != 'global'"
        ).one().count;
        if (distinctClients >= MAX_CLIENTS) return { allowed: false, retryAfter: 60 };
      }

      const recentRequests = sql.exec(
        "SELECT COUNT(*) AS count, MIN(created_at) AS first FROM ai_requests WHERE client = ? AND created_at > ?",
        payload.key,
        now - WINDOW_MS
      ).one();
      if (recentRequests.count >= MAX_REQUESTS_PER_WINDOW || clientCount >= MAX_REQUESTS_PER_DAY) {
        const isWindowLimited = recentRequests.count >= MAX_REQUESTS_PER_WINDOW;
        const first = isWindowLimited ? recentRequests.first : sql.exec(
          "SELECT MIN(created_at) AS first FROM ai_requests WHERE client = ?",
          payload.key
        ).one().first;
        const period = isWindowLimited ? WINDOW_MS : DAY_MS;
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((first + period - now) / 1000)) };
      }

      sql.exec("INSERT INTO ai_requests (client, created_at) VALUES ('global', ?)", now);
      sql.exec("INSERT INTO ai_requests (client, created_at) VALUES (?, ?)", payload.key, now);
      return { allowed: true, retryAfter: 0 };
    });

    return jsonResponse(200, result);
  }
}

export default {
  async fetch(request, environment) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") {
      return handleChat(request, environment);
    }
    if (url.pathname.startsWith("/api/")) {
      return jsonResponse(404, { error: "Not found" });
    }

    return withSecurityHeaders(await environment.ASSETS.fetch(request));
  }
};
