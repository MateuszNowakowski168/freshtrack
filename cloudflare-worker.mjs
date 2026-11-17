import { DurableObject } from "cloudflare:workers";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

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

export class UsageLimiter extends DurableObject {
  async fetch() {
    return new Response("Not found", { status: 404 });
  }
}

export default {
  async fetch(request, environment) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return withSecurityHeaders(new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { "Content-Type": "application/json; charset=utf-8" } }
      ));
    }

    return withSecurityHeaders(await environment.ASSETS.fetch(request));
  }
};
