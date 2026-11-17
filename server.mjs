import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
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
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);

export function createAppServer() {
  return createHttpServer(async (request, response) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.setHeader(name, value);
    }

    const pathname = new URL(request.url, "http://localhost").pathname;
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
