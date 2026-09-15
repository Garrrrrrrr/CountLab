import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

// Local/CI preview of the exact artifact deployed to Pages.
const root = path.resolve("out");
const port = Number(process.env.PORT || 3100);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm" };
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    let status = 200;
    try {
      if ((await stat(file)).isDirectory()) {
        if (!url.pathname.endsWith("/")) { response.writeHead(308, { Location: `${url.pathname}/${url.search}` }).end(); return; }
        file = path.join(file, "index.html");
      }
      await stat(file);
    } catch { file = path.join(root, "404.html"); status = 404; }
    response.writeHead(status, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).on("error", () => response.destroy()).pipe(response);
  } catch { response.writeHead(400).end(); }
}).listen(port, "127.0.0.1", () => console.log(`CountLab export: http://127.0.0.1:${port}`));
