// Server tĩnh tối giản để xem giao diện frontend/site khi không bật Docker.
// /api và /auth không có backend nên trang sẽ dùng dữ liệu dự phòng trong js/data.js.
// Chạy: node scripts/dev_static_server.mjs  → http://localhost:5500
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../frontend/site/", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.startsWith("/api/") || path.startsWith("/auth/")) {
    res.writeHead(503, { "Content-Type": "application/json" }).end('{"detail":"Backend không chạy ở chế độ xem tĩnh"}');
    return;
  }
  const file = normalize(join(root, path === "/" ? "index.html" : path));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(5500, () => console.log("Static site: http://localhost:5500"));
