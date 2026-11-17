import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "./server.mjs";

test("serves the expiry tracker and its static assets", async t => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();

  const page = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<title>FreshTrack/);
  assert.doesNotMatch(html, /Przepisy|aiForm|Asystent AI/);

  const app = await fetch(`http://127.0.0.1:${address.port}/app.js`);
  assert.equal(app.status, 200);
  assert.doesNotMatch(await app.text(), /recipeCatalog|api\/recommendations/);

  const styles = await fetch(`http://127.0.0.1:${address.port}/styles.css`);
  assert.equal(styles.status, 200);
});

test("does not expose an AI endpoint or server source files", async t => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();

  for (const pathname of ["/api/recommendations", "/server.mjs", "/ai-core.mjs"]) {
    const response = await fetch(`http://127.0.0.1:${address.port}${pathname}`, { method: "POST" });
    assert.equal(response.status, 404, pathname);
  }
});
