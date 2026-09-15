import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const allowed = new Set([
  "/index.html",
  "/styles.css",
  "/site.js",
  "/config.js",
  "/favicon.svg",
  "/favicon.png",
  "/apple-touch-icon.png",
]);
const port = Number(process.env.PORT || 4173);
http
  .createServer(async (req, res) => {
    try {
      const route = new URL(req.url, "http://localhost").pathname;
      const file = route === "/" ? "/index.html" : route;
      if (!allowed.has(file)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const data = await readFile(path.join(root, file));
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)],
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end("Unable to serve file");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Clarora website: http://127.0.0.1:${port}`),
  );
