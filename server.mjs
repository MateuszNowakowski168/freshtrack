import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getChatReply, validateChatPayload } from "./ai-core.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const MAX_BODY_BYTES = 64 * 1024;
const WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CLIENTS = 10_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_REQUESTS_PER_DAY = 25;
const MAX_GLOBAL_REQUESTS_PER_DAY = 300;
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/assistant.css", ["assistant.css", "text/css; charset=utf-8"]]
]);

function jsonResponse(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

export { validateChatPayload };

export class RateLimiter {
  constructor() {
    this.clients = new Map();
    this.globalRequests = [];
  }

  consume(clientKey, now = Date.now()) {
    const cutoff = now - DAY_MS;
    this.globalRequests = this.globalRequests.filter(timestamp => timestamp > cutoff);
    if (this.globalRequests.length >= MAX_GLOBAL_REQUESTS_PER_DAY) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((this.globalRequests[0] + DAY_MS - now) / 1000)) };
    }

    let requests = this.clients.get(clientKey) || [];
    requests = requests.filter(timestamp => timestamp > cutoff);
    const recent = requests.filter(timestamp => timestamp > now - WINDOW_MS);
    if (recent.length >= MAX_REQUESTS_PER_WINDOW || requests.length >= MAX_REQUESTS_PER_DAY) {
      const resetAt = recent.length >= MAX_REQUESTS_PER_WINDOW
        ? recent[0] + WINDOW_MS
        : requests[0] + DAY_MS;
      this.clients.set(clientKey, requests);
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
    }

    if (!this.clients.has(clientKey) && this.clients.size >= MAX_CLIENTS) {
      for (const [key, timestamps] of this.clients) {
        const active = timestamps.filter(timestamp => timestamp > cutoff);
        if (active.length) this.clients.set(key, active);
        else this.clients.delete(key);
      }
      if (this.clients.size >= MAX_CLIENTS) return { allowed: false, retryAfter: 60 };
    }

    requests.push(now);
    this.clients.set(clientKey, requests);
    this.globalRequests.push(now);
    return { allowed: true, retryAfter: 0 };
  }
}

function clientAddress(request, trustProxy) {
  if (trustProxy && typeof request.headers["x-forwarded-for"] === "string") {
    const forwarded = request.headers["x-forwarded-for"].split(",").map(value => value.trim()).filter(Boolean);
    if (forwarded.length) return forwarded[forwarded.length - 1].slice(0, 100);
  }
  return (request.socket.remoteAddress || "unknown").slice(0, 100);
}

async function readRequestBody(request) {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    const error = new Error("Request too large");
    error.status = 413;
    throw error;
  }

  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      const error = new Error("Request too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON");
    error.status = 400;
    throw error;
  }
}

export function createAppServer({
  environment = process.env,
  fetchImplementation = fetch,
  limiter = new RateLimiter()
} = {}) {
  const server = createHttpServer(async (request, response) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.setHeader(name, value);
    }
    const pathname = new URL(request.url, "http://localhost").pathname;

    if (pathname === "/api/chat") {
      if (request.method !== "POST") {
        jsonResponse(response, 405, { error: "Method not allowed" }, { Allow: "POST" });
        return;
      }
      if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
        jsonResponse(response, 415, { error: "Content type must be JSON" });
        return;
      }

      try {
        const payload = validateChatPayload(await readRequestBody(request));
        if (!payload) {
          jsonResponse(response, 400, { error: "Invalid request" });
          return;
        }
        if (!environment.AI_API_KEY) {
          jsonResponse(response, 503, { error: "OpenRouter is not configured" });
          return;
        }

        const limit = limiter.consume(clientAddress(request, environment.TRUST_PROXY === "1"));
        if (!limit.allowed) {
          jsonResponse(response, 429, { error: "Rate limit exceeded" }, { "Retry-After": String(limit.retryAfter) });
          return;
        }

        const reply = await getChatReply(payload, environment.AI_API_KEY, fetchImplementation);
        if (!reply) {
          jsonResponse(response, 503, { error: "OpenRouter is not configured" });
          return;
        }
        jsonResponse(response, 200, { reply });
      } catch (error) {
        if (error.status === 400 || error.status === 413) {
          jsonResponse(response, error.status, { error: error.status === 413 ? "Request too large" : "Invalid request" });
          return;
        }
        console.error("AI chat request failed:", error.message);
        const timedOut = error.name === "TimeoutError" || /timed out|timeout|operation was aborted/i.test(error.message);
        jsonResponse(response, timedOut ? 504 : 502, {
          error: timedOut ? "Chat request timed out" : "Chat service unavailable"
        });
      }
      return;
    }

    const staticFile = STATIC_FILES.get(pathname);
    if (request.method !== "GET" || !staticFile) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end("Nie znaleziono strony.");
      return;
    }
    try {
      const content = await readFile(path.join(ROOT, staticFile[0]));
      response.writeHead(200, {
        "Content-Type": staticFile[1],
        "Cache-Control": "no-cache"
      });
      response.end(content);
    } catch (error) {
      console.error("Static file read failed:", error.message);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end("Nie można teraz wyświetlić strony.");
    }
  });
  server.requestTimeout = 65_000;
  server.headersTimeout = 15_000;
  server.maxHeadersCount = 50;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("PORT must be a valid TCP port.");
    process.exitCode = 1;
  } else {
    createAppServer().listen(port, host, () => {
      console.log(`FreshTrack is running at http://${host}:${port}`);
    });
  }
}
