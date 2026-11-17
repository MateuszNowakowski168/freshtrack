import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer, RateLimiter } from "./server.mjs";
import { getRecommendations, validatePayload } from "./ai-core.mjs";

test("validates product and preference input and ignores extra fields", () => {
  const result = validatePayload({
    items: [{ name: "Jogurt", date: "2026-11-18", notes: "not sent" }],
    preferences: "szybki obiad",
    history: "not sent"
  }, "2026-11-17");

  assert.deepEqual(result, {
    items: [{ name: "Jogurt", date: "2026-11-18" }],
    preferences: "szybki obiad"
  });
  assert.deepEqual(validatePayload({ items: [], preferences: "przepis na zupę" }, "2026-11-17"), {
    items: [],
    preferences: "przepis na zupę"
  });
  assert.equal(validatePayload({ items: [], preferences: "" }, "2026-11-17"), null);
});

test("rejects expired, malformed, and oversized input", () => {
  assert.equal(validatePayload({ items: [{ name: "Mleko", date: "2026-11-16" }], preferences: "" }, "2026-11-17"), null);
  assert.equal(validatePayload({ items: [{ name: "Mleko", date: "2026-02-31" }], preferences: "" }, "2026-02-01"), null);
  assert.equal(validatePayload({ items: [{ name: "Mleko", date: "2026-11-18" }], preferences: "x".repeat(501) }, "2026-11-17"), null);
  assert.equal(validatePayload({ items: Array.from({ length: 41 }, () => ({ name: "Mleko", date: "2026-11-18" })), preferences: "" }, "2026-11-17"), null);
});

test("enforces short-window and daily per-client request limits", () => {
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
});

test("enforces a process-wide daily request ceiling", () => {
  const limiter = new RateLimiter();
  const start = Date.UTC(2026, 10, 17);
  for (let count = 0; count < 300; count++) {
    assert.equal(limiter.consume(`client-${count}`, start).allowed, true);
  }
  assert.equal(limiter.consume("client-over-global-limit", start).allowed, false);
});

test("sends AI requests only through OpenRouter's free router", async t => {
  let upstreamRequest;
  const server = createAppServer({
    environment: { AI_API_KEY: "test-secret" },
    fetchImplementation: async (url, options) => {
      upstreamRequest = { url, options, body: JSON.parse(options.body) };
      return Response.json({
        model: "example/model:free",
        choices: [{ message: { content: "Pomysł na danie" } }]
      });
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ name: "Jogurt", date: "2026-11-18", notes: "not sent" }],
      preferences: "szybki obiad"
    })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { recommendations: "Pomysł na danie" });
  assert.equal(upstreamRequest.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(upstreamRequest.body.model, "openrouter/free");
  assert.equal(upstreamRequest.body.max_tokens, 700);
  assert.match(upstreamRequest.body.messages[0].content, /jeden kompletny, praktyczny przepis/);
  assert.match(upstreamRequest.body.messages[0].content, /Do dokupienia/);
  assert.match(upstreamRequest.body.messages[0].content, /zwykłym tekstem bez znaczników Markdown/);
  assert.equal(upstreamRequest.options.headers.Authorization, "Bearer test-secret");
  assert.equal(JSON.stringify(upstreamRequest.body).includes("not sent"), false);
});

test("accepts a written recipe request without saved products", async t => {
  let upstreamRequest;
  const server = createAppServer({
    environment: { AI_API_KEY: "test-secret" },
    fetchImplementation: async (url, options) => {
      upstreamRequest = { url, body: JSON.parse(options.body) };
      return Response.json({
        model: "example/model:free",
        choices: [{ message: { content: "Makaron z kurczakiem" } }]
      });
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [],
      preferences: "Napisz przepis na makaron z kurczakiem"
    })
  });

  assert.equal(response.status, 200);
  assert.match((await response.json()).recommendations, /Makaron/);
  assert.equal(upstreamRequest.body.messages[1].content.includes("Napisz przepis na makaron z kurczakiem"), true);
  assert.match(upstreamRequest.body.messages[0].content, /jeden kompletny, praktyczny przepis/);
});

test("rejects a response unless OpenRouter confirms a free model", async t => {
  const server = createAppServer({
    environment: { AI_API_KEY: "test-secret" },
    fetchImplementation: async () => Response.json({
      model: "example/model",
      choices: [{ message: { content: "Paid model response" } }]
    })
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/recommendations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ name: "Jogurt", date: "2026-11-18" }], preferences: "" })
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Recommendation service unavailable" });
});

test("shared OpenRouter client uses only the free router and caps provider output", async () => {
  let upstreamRequest;
  const recommendations = await getRecommendations(
    { items: [{ name: "Jogurt", date: "2026-11-18" }], preferences: "" },
    "test-secret",
    async (url, options) => {
      upstreamRequest = { url, body: JSON.parse(options.body) };
      return Response.json({
        model: "example/model:free",
        choices: [{ message: { content: "Pomysł na danie" } }]
      });
    }
  );
  assert.equal(recommendations, "Pomysł na danie");
  assert.equal(upstreamRequest.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(upstreamRequest.body.model, "openrouter/free");
  assert.equal(upstreamRequest.body.max_tokens, 700);
});

test("shared OpenRouter client rejects any non-free model response", async () => {
  await assert.rejects(() => getRecommendations(
    { items: [{ name: "Jogurt", date: "2026-11-18" }], preferences: "" },
    "test-secret",
    async () => Response.json({
      model: "example/model",
      choices: [{ message: { content: "Paid model response" } }]
    })
  ), /did not return a free model/);
});

test("shared OpenRouter client includes bounded provider error details", async () => {
  await assert.rejects(() => getRecommendations(
    { items: [{ name: "Jogurt", date: "2026-11-18" }], preferences: "" },
    "test-secret",
    async () => Response.json({ error: { message: "Invalid request details" } }, { status: 400 })
  ), /OpenRouter returned 400: Invalid request details/);
});

test("local server serves only public assets", async t => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();

  const page = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>FreshTrack/);

  const serverSource = await fetch(`http://127.0.0.1:${address.port}/server.mjs`);
  assert.equal(serverSource.status, 404);
});
