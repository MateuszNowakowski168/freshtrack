import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer, RateLimiter, validateChatPayload } from "./server.mjs";
import { getChatReply } from "./ai-core.mjs";

const futureDate = "2099-12-30";
const validPayload = {
  items: [{ name: "Jogurt", date: futureDate, qty: 2 }],
  messages: [{ role: "user", content: "Podaj pomysł na szybkie śniadanie." }]
};

async function startServer(t, options) {
  const server = createAppServer(options);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

test("validates pantry products and bounded food chat history", () => {
  const result = validateChatPayload({
    items: [{ name: "Jogurt", date: futureDate, qty: 2, notes: "not sent" }],
    messages: [
      { role: "user", content: "Szukam prostego śniadania." },
      { role: "assistant", content: "Może owsianka z jogurtem?" },
      { role: "user", content: "Napisz dokładny przepis." }
    ],
    extra: "ignored"
  });

  assert.deepEqual(result, {
    items: [{ name: "Jogurt", date: futureDate, qty: 2 }],
    messages: [
      { role: "user", content: "Szukam prostego śniadania." },
      { role: "assistant", content: "Może owsianka z jogurtem?" },
      { role: "user", content: "Napisz dokładny przepis." }
    ]
  });
  assert.equal(validateChatPayload({ items: [], messages: [{ role: "user", content: "Cześć" }] }).items.length, 0);
});

test("rejects expired, malformed, oversized, and non-user-ending chat payloads", () => {
  assert.equal(validateChatPayload({
    items: [{ name: "Mleko", date: "2020-01-01", qty: 1 }],
    messages: [{ role: "user", content: "Pomysł?" }]
  }), null);
  assert.equal(validateChatPayload({
    items: [{ name: "Mleko", date: "2099-02-31", qty: 1 }],
    messages: [{ role: "user", content: "Pomysł?" }]
  }), null);
  assert.equal(validateChatPayload({
    items: [{ name: "Mleko", date: futureDate, qty: 1 }],
    messages: [{ role: "user", content: "x".repeat(1201) }]
  }), null);
  assert.equal(validateChatPayload({
    items: [],
    messages: [{ role: "assistant", content: "Odpowiedź bez pytania" }]
  }), null);
  assert.equal(validateChatPayload({
    items: [],
    messages: Array.from({ length: 9 }, () => ({ role: "user", content: "Pytanie" }))
  }), null);
});

test("enforces short-window, daily, and global request limits", () => {
  const limiter = new RateLimiter();
  const start = Date.UTC(2026, 10, 17);
  for (let count = 0; count < 5; count++) {
    assert.equal(limiter.consume("client-a", start).allowed, true);
  }
  assert.equal(limiter.consume("client-a", start).allowed, false);

  for (let window = 0; window < 5; window++) {
    const time = start + window * 16 * 60 * 1000;
    for (let count = 0; count < 5; count++) {
      assert.equal(limiter.consume("client-b", time).allowed, true);
    }
  }
  assert.equal(limiter.consume("client-b", start + 80 * 60 * 1000).allowed, false);

  const globalLimiter = new RateLimiter();
  for (let count = 0; count < 300; count++) {
    assert.equal(globalLimiter.consume(`client-${count}`, start).allowed, true);
  }
  assert.equal(globalLimiter.consume("over-global-limit", start).allowed, false);
});

test("sends pantry and recent conversation to OpenRouter's free model only", async t => {
  let upstreamRequest;
  const baseUrl = await startServer(t, {
    environment: { AI_API_KEY: "test-secret" },
    fetchImplementation: async (url, options) => {
      upstreamRequest = { url, options, body: JSON.parse(options.body) };
      return Response.json({
        model: "example/model:free",
        choices: [{ message: { content: "Omlet z warzywami i jogurtem." } }]
      });
    }
  });
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ name: "Jogurt", date: futureDate, qty: 2, notes: "private note" }],
      messages: [
        { role: "user", content: "Szukam śniadania." },
        { role: "assistant", content: "Co masz w spiżarni?" },
        { role: "user", content: "Napisz przepis z jogurtem." }
      ]
    })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: "Omlet z warzywami i jogurtem." });
  assert.equal(upstreamRequest.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(upstreamRequest.body.model, "openrouter/free");
  assert.equal(upstreamRequest.body.max_tokens, 900);
  assert.match(upstreamRequest.body.messages[0].content, /wyłącznie o jedzeniu/);
  assert.match(upstreamRequest.body.messages[0].content, /Nie wyszukujesz w internecie/);
  assert.match(upstreamRequest.body.messages[1].content, /Jogurt — 2 szt./);
  assert.deepEqual(upstreamRequest.body.messages.slice(2).map(message => message.content), [
    "Szukam śniadania.",
    "Co masz w spiżarni?",
    "Napisz przepis z jogurtem."
  ]);
  assert.equal(JSON.stringify(upstreamRequest.body).includes("private note"), false);
  assert.equal(upstreamRequest.options.headers.Authorization, "Bearer test-secret");
});

test("accepts a text recipe request without saved products", async t => {
  const baseUrl = await startServer(t, {
    environment: { AI_API_KEY: "test-secret" },
    fetchImplementation: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.match(body.messages[1].content, /Brak dostępnych produktów/);
      return Response.json({
        model: "example/model:free",
        choices: [{ message: { content: "Makaron z kurczakiem." } }]
      });
    }
  });
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [],
      messages: [{ role: "user", content: "Napisz przepis na makaron z kurczakiem." }]
    })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reply: "Makaron z kurczakiem." });
});

test("enforces rate limits before calling the AI provider", async t => {
  const limiter = { consume: () => ({ allowed: false, retryAfter: 30 }) };
  let called = false;
  const baseUrl = await startServer(t, {
    environment: { AI_API_KEY: "test-secret" },
    limiter,
    fetchImplementation: async () => {
      called = true;
      throw new Error("should not be called");
    }
  });
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload)
  });

  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  assert.equal(called, false);
});

test("returns a clear configuration error when the API key is missing", async t => {
  const baseUrl = await startServer(t, { environment: {} });
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload)
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "OpenRouter is not configured" });
});

test("refuses a response from a paid model", async t => {
  const baseUrl = await startServer(t, {
    environment: { AI_API_KEY: "test-secret" },
    fetchImplementation: async () => Response.json({
      model: "example/model",
      choices: [{ message: { content: "Paid response" } }]
    })
  });
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload)
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Chat service unavailable" });
});

test("reports an upstream timeout clearly", async t => {
  const baseUrl = await startServer(t, {
    environment: { AI_API_KEY: "test-secret" },
    fetchImplementation: async () => {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    }
  });
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload)
  });

  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: "Chat request timed out" });
});

test("shared OpenRouter client bounds output and rejects non-free models", async () => {
  const reply = await getChatReply(validPayload, "test-secret", async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(JSON.parse(options.body).model, "openrouter/free");
    return Response.json({
      model: "example/model:free",
      choices: [{ message: { content: "x".repeat(6000) } }]
    });
  });
  assert.equal(reply.length, 5000);

  await assert.rejects(() => getChatReply(validPayload, "test-secret", async () => Response.json({
    model: "example/model",
    choices: [{ message: { content: "Paid response" } }]
  })), /did not return a free model/);
});

test("serves the expiry tracker and chat assets without exposing server code", async t => {
  const baseUrl = await startServer(t);
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>FreshTrack/);
  assert.match(html, /Asystent kulinarny/);
  assert.match(html, /Do OpenRouter wysyłamy nazwy, ilości i terminy/);

  for (const [pathname, expectedType] of [
    ["/app.js", /text\/javascript/],
    ["/styles.css", /text\/css/],
    ["/assistant.css", /text\/css/]
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type"), expectedType);
  }

  for (const pathname of ["/api/recommendations", "/server.mjs", "/ai-core.mjs"]) {
    const response = await fetch(`${baseUrl}${pathname}`, { method: "POST" });
    assert.equal(response.status, 404, pathname);
  }
});
